import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import PracticeInterface from './practice-interface';

export default async function ListeningPage({ params }: { params: Promise<{ sentenceId: string }> }) {
  const { sentenceId } = await params;
  const session = await auth();
  
  if (!session?.user?.id) return <div>Unauthorized</div>;

  const sentence = await prisma.sentence.findUnique({
    where: { id: sentenceId },
    include: { 
      material: {
        include: {
          folder: true
        }
      }
    }
  });
  
  if (!sentence || sentence.material.userId !== session.user.id) notFound();

  // Find next/prev sentence for navigation
  const nextSentence = await prisma.sentence.findFirst({
      where: { materialId: sentence.materialId, order: sentence.order + 1 }
  });
  const prevSentence = await prisma.sentence.findFirst({
      where: { materialId: sentence.materialId, order: sentence.order - 1 }
  });

  return (
    <PracticeInterface 
        sentence={sentence} 
        materialId={sentence.materialId}
        nextId={nextSentence?.id}
        prevId={prevSentence?.id}
    />
  );
}

