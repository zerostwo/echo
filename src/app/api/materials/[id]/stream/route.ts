import { auth } from '@/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { createReadStream, statSync, existsSync } from 'fs';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import path from 'path';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });
    
    // Use admin client for DB access to ensure we can find the material
    // The anon 'supabase' client doesn't have the user's auth context
    const client = supabaseAdmin || supabase;

    if (!supabaseAdmin) {
        console.warn("[Stream] Warning: supabaseAdmin is not available. Using anon client. DB queries may fail due to RLS.");
    }

    const { data: material } = await client
        .from('materials')
        .select('file_path, mime_type')
        .eq('id', id)
        .eq('user_id', session.user.id)
        .single();

    if (!material) {
        console.error(`[Stream] Material not found or access denied. ID: ${id}, User: ${session.user.id}`);
        return new NextResponse('Not Found', { status: 404 });
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

    // Handle Supabase Storage file
    // client is already defined above
    
    console.log(`[Stream] Serving file: ${filePath} for material: ${id}`);

    // If it's an external URL already
    if (filePath.startsWith('http')) {
        return NextResponse.redirect(filePath);
    }

    // Generate signed URL
    const storageBucketsToTry = ['materials', 'echo'];
    let signedUrlData: { signedUrl: string } | null = null;
    let signedUrlError: any = null;
    let bucketUsed: string | null = null;

    for (const bucket of storageBucketsToTry) {
        const { data, error } = await client.storage
            .from(bucket)
            .createSignedUrl(filePath, 3600); // 1 hour validity

        if (!error && data?.signedUrl) {
            signedUrlData = data;
            bucketUsed = bucket;
            break;
        }

        if (error) {
            signedUrlError = error;
        }
    }

    if (!signedUrlData?.signedUrl) {
        console.error("Failed to create signed URL:", signedUrlError);
        console.error("FilePath:", filePath);
        return new NextResponse('File not found in storage', { status: 404 });
    }


    try {
        // Proxy the request to Supabase Storage to avoid CORS/Redirect issues
        const headersList = await headers();
        const range = headersList.get('range');
        
        const fetchHeaders: HeadersInit = {};
        if (range) {
            fetchHeaders['Range'] = range;
        }

        console.log(`[Stream] Proxying request to: ${signedUrlData.signedUrl} (bucket: ${bucketUsed})`);
        const upstreamResponse = await fetch(signedUrlData.signedUrl, {
            headers: fetchHeaders
        });

        if (!upstreamResponse.ok) {
            console.error(`Upstream fetch failed: ${upstreamResponse.status} ${upstreamResponse.statusText}`);
            console.error(`URL was: ${signedUrlData.signedUrl}`);
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
