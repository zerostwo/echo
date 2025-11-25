import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { SetBreadcrumbs } from '@/components/set-breadcrumbs';
import { MaterialStatsCard } from './material-stats-card';
import { SentencesTable } from './sentences-table';

export default async function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return <div>Unauthorized</div>;

  const material = await prisma.material.findUnique({
    where: { id, userId: session.user.id },
    include: { 
        sentences: { orderBy: { order: 'asc' } },
        folder: true
    }
  });

  if (!material) notFound();

  // Calculate Vocab Count (distinct words in this material)
  const vocabCount = await prisma.word.count({
      where: {
          occurrences: {
              some: {
                  sentence: {
                      materialId: id
                  }
              }
          }
      }
  });

  // Calculate Words Per Minute
  const durationInMins = (material.duration || 0) / 60;
  const wpm = durationInMins > 0 ? vocabCount / durationInMins : 0;

  // Prepare breadcrumbs
  const breadcrumbs = [
      { title: "Materials", href: "/materials" },
  ];
  
  if (material.folder) {
       breadcrumbs.push({ 
           title: material.folder.name, 
           href: `/materials?folderId=${material.folder.id}` 
       });
  }
  
  breadcrumbs.push({ title: material.title });

  const isVideo = material.mimeType?.startsWith('video/');

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <SetBreadcrumbs items={breadcrumbs} />

      <MaterialStatsCard 
        material={material}
        vocabCount={vocabCount}
        wpm={wpm}
      />

      <div className="space-y-4">
        <SentencesTable data={material.sentences} />
      </div>
    </div>
  );
}
