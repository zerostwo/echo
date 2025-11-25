import { auth } from '@/auth';
import { getMaterialVocab } from '@/actions/vocab-actions';
import { VocabTable, vocabColumns } from '@/app/vocab/vocab-table';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import prisma from '@/lib/prisma';

export default async function MaterialVocabPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user?.id) return <div>Unauthorized</div>;

    const resolvedParams = await params;
    const materialId = resolvedParams.id;

    const material = await prisma.material.findUnique({
        where: { id: materialId, userId: session.user.id },
        select: { title: true }
    });

    if (!material) return <div>Material not found</div>;

    const { words } = await getMaterialVocab(materialId);

    return (
        <div className="p-8 h-full flex flex-col">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/materials">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        Vocabulary
                    </h1>
                    <p className="text-muted-foreground">
                        {words?.length || 0} words from "{material.title}"
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                <VocabTable columns={vocabColumns} data={words || []} />
            </div>
        </div>
    );
}

