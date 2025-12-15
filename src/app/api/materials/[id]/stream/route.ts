import { auth } from '@/auth';
import { getAdminClient, APPWRITE_DATABASE_ID } from '@/lib/appwrite';
import { createReadStream, statSync, existsSync } from 'fs';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import path from 'path';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });
    
    const admin = getAdminClient();

    let material;
    try {
        material = await admin.databases.getDocument(
            APPWRITE_DATABASE_ID,
            'materials',
            id
        );
    } catch (e) {
        console.error(`[Stream] Material not found or access denied. ID: ${id}, User: ${session.user.id}`);
        return new NextResponse('Not Found', { status: 404 });
    }

    if (material.user_id !== session.user.id) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const filePath = material.file_path;

    // Check if it is a local file (legacy support)
    const isLocalFile = path.isAbsolute(filePath) && existsSync(filePath);

    if (isLocalFile) {
        const stat = statSync(filePath);
        const fileSize = stat.size;
        const headersList = await headers();
        const range = headersList.get('range');

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = createReadStream(filePath, { start, end });
            
            // @ts-expect-error: standard Web Stream vs Node stream mismatch, but works in Next.js
            return new NextResponse(file, {
                status: 206,
                headers: {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize.toString(),
                    'Content-Type': material.mime_type || 'audio/mpeg',
                },
            });
        } else {
            const file = createReadStream(filePath);
            // @ts-expect-error: standard Web Stream vs Node stream mismatch
            return new NextResponse(file, {
                status: 200,
                headers: {
                    'Content-Length': fileSize.toString(),
                    'Content-Type': material.mime_type || 'audio/mpeg',
                },
            });
        }
    }

    // Handle Appwrite Storage file
    console.log(`[Stream] Serving file: ${filePath} for material: ${id}`);

    // If it's an external URL already
    if (filePath.startsWith('http')) {
        return NextResponse.redirect(filePath);
    }

    // Appwrite Storage
    // We need to get the file view URL or download URL
    // Since we are proxying, we can use the download endpoint but we need to sign it or use admin key?
    // Actually, Appwrite Node SDK doesn't have createSignedUrl like Supabase.
    // But we can use getFileView or getFileDownload.
    // However, those return buffers in Node SDK.
    // We want to stream.
    
    // We can construct the URL manually and fetch it with the project ID/API Key.
    // Or use the client SDK method if available? No, we are on server.
    
    // Let's construct the URL.
    // Endpoint: /storage/buckets/{bucketId}/files/{fileId}/view
    // We need to pass project ID.
    // If the file is private, we need a session or JWT.
    // Since we are the server, we can use the API Key in the header X-Appwrite-Key.
    
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;
    const bucketId = 'materials'; // Assuming bucket name
    
    if (!endpoint || !projectId || !apiKey) {
        return new NextResponse('Server Configuration Error', { status: 500 });
    }

    const fileUrl = `${endpoint}/storage/buckets/${bucketId}/files/${filePath}/view?project=${projectId}`;

    try {
        // Proxy the request to Appwrite Storage
        const headersList = await headers();
        const range = headersList.get('range');
        
        const fetchHeaders: HeadersInit = {
            'X-Appwrite-Project': projectId,
            'X-Appwrite-Key': apiKey
        };
        
        if (range) {
            fetchHeaders['Range'] = range;
        }

        console.log(`[Stream] Proxying request to: ${fileUrl}`);
        const upstreamResponse = await fetch(fileUrl, {
            headers: fetchHeaders
        });

        if (!upstreamResponse.ok) {
            console.error(`Upstream fetch failed: ${upstreamResponse.status} ${upstreamResponse.statusText}`);
            return new NextResponse('Failed to fetch file from storage', { status: upstreamResponse.status });
        }

        // Forward relevant headers
        const responseHeaders = new Headers();
        responseHeaders.set('Content-Type', upstreamResponse.headers.get('Content-Type') || material.mime_type || 'audio/mpeg');
        responseHeaders.set('Content-Length', upstreamResponse.headers.get('Content-Length') || '');
        responseHeaders.set('Accept-Ranges', 'bytes');
        
        if (upstreamResponse.headers.has('Content-Range')) {
            responseHeaders.set('Content-Range', upstreamResponse.headers.get('Content-Range')!);
        }

        return new NextResponse(upstreamResponse.body, {
            status: upstreamResponse.status,
            headers: responseHeaders
        });
    } catch (fetchError) {
        console.error("Stream proxy error:", fetchError);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
