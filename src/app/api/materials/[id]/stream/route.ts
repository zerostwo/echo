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
    
    const { data: material } = await supabase
        .from('Material')
        .select('filePath, mimeType')
        .eq('id', id)
        .eq('userId', session.user.id)
        .single();

    if (!material) return new NextResponse('Not Found', { status: 404 });

    const filePath = material.filePath;

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
                    'Content-Type': material.mimeType || 'audio/mpeg',
                },
            });
        } else {
            const file = createReadStream(filePath);
            // @ts-expect-error: standard Web Stream vs Node stream mismatch
            return new NextResponse(file, {
                status: 200,
                headers: {
                    'Content-Length': fileSize.toString(),
                    'Content-Type': material.mimeType || 'audio/mpeg',
                },
            });
        }
    }

    // Handle Supabase Storage file
    const client = supabaseAdmin || supabase;
    
    console.log(`[Stream] Serving file: ${filePath} for material: ${id}`);

    // If it's an external URL already
    if (filePath.startsWith('http')) {
        return NextResponse.redirect(filePath);
    }

    // Generate signed URL
    const { data, error } = await client.storage
        .from('echo')
        .createSignedUrl(filePath, 3600); // 1 hour validity

    if (error || !data?.signedUrl) {
        console.error("Failed to create signed URL:", error);
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

        console.log(`[Stream] Proxying request to: ${data.signedUrl}`);
        const upstreamResponse = await fetch(data.signedUrl, {
            headers: fetchHeaders
        });

        if (!upstreamResponse.ok) {
            console.error(`Upstream fetch failed: ${upstreamResponse.status} ${upstreamResponse.statusText}`);
            return new NextResponse('Failed to fetch file from storage', { status: upstreamResponse.status });
        }

        // Forward relevant headers
        const responseHeaders = new Headers();
        responseHeaders.set('Content-Type', upstreamResponse.headers.get('Content-Type') || material.mimeType || 'audio/mpeg');
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
