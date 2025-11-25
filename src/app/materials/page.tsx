import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { MaterialsTableWrapper } from '@/components/materials/materials-table-wrapper';
import { UploadMaterialDialog } from './upload-dialog';
import { HeaderPortal } from '@/components/header-portal';

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ folderId?: string }> }) {
  const session = await auth();
  const resolvedSearchParams = await searchParams;
  const currentFolderId = resolvedSearchParams.folderId;

  if (!session?.user?.id) return <div>Unauthorized</div>;

  // Fetch folders for the "Move to" action
  const folders = await prisma.folder.findMany({
    where: { 
        userId: session.user.id,
        deletedAt: null
    },
    orderBy: { name: 'asc' }
  });

  let materialsWhere: any = {
      userId: session.user.id,
      deletedAt: null
  };

  let currentFolderName = "All Materials";

  if (currentFolderId === 'unfiled') {
      // Legacy support if user bookmarked unfiled, though we removed link
      materialsWhere.folderId = null;
      currentFolderName = "Unfiled Materials";
  } else if (currentFolderId) {
      materialsWhere.folderId = currentFolderId;
      const folder = folders.find(f => f.id === currentFolderId);
      currentFolderName = folder ? folder.name : "Materials";
  } else {
      currentFolderName = "All Materials";
  }

  const materials = await prisma.material.findMany({
    where: materialsWhere,
    orderBy: { title: 'asc' },
    include: {
        _count: {
            select: { 
                sentences: true 
            }
        },
        sentences: {
            include: {
                practices: {
                    where: { userId: session.user.id }
                },
                // For approximate vocab count (word occurrences)
                // Ideally we just count unique wordIds across all sentences in this material
                occurrences: {
                    select: { wordId: true }
                }
            }
        }
    }
  });

  // Process materials to calculate stats
  const processedMaterials = materials.map(m => {
      // Calculate Practice Stats
      const totalSentences = m.sentences.length;
      const practicedSentences = m.sentences.filter(s => s.practices.length > 0).length;
      
      let totalScore = 0;
      let totalDuration = 0;
      let totalAttempts = 0;

      m.sentences.forEach(s => {
          if (s.practices.length > 0) {
               // Assuming only 1 practice record per user per sentence due to @@unique constraint
               // but if logic changes to many, this needs adjustment. 
               // Current schema: PracticeProgress @@unique([userId, sentenceId])
               const p = s.practices[0];
               totalScore += p.score;
               totalDuration += p.duration || 0;
               totalAttempts += p.attempts;
          }
      });

      const avgScore = practicedSentences > 0 ? Math.round(totalScore / practicedSentences) : 0;

      // Calculate Vocab Count
      const uniqueWordIds = new Set<string>();
      m.sentences.forEach(s => {
          s.occurrences.forEach(o => uniqueWordIds.add(o.wordId));
      });
      
      return {
          ...m,
          stats: {
              practicedCount: practicedSentences,
              totalSentences: totalSentences,
              avgScore: avgScore,
              vocabCount: uniqueWordIds.size,
              duration: totalDuration,
              attempts: totalAttempts
          }
      };
  });

  return (
    <div className="p-8 h-full">
      <HeaderPortal>
          <UploadMaterialDialog folderId={currentFolderId === 'unfiled' ? null : currentFolderId || null} />
      </HeaderPortal>
      
      <MaterialsTableWrapper materials={processedMaterials} folders={folders} />
    </div>
  );
}
