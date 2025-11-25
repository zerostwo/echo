import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { createReadStream, statSync } from 'fs';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });
    
    const material = await prisma.material.findUnique({
        where: { id, userId: session.user.id }
    });

    if (!material) return new NextResponse('Not Found', { status: 404 });

    const filePath = material.filePath;
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

