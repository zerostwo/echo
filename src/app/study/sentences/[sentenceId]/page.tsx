import { auth } from '@/auth';
import { getAdminClient, APPWRITE_DATABASE_ID, Query } from '@/lib/appwrite';
import { notFound, redirect } from 'next/navigation';
import PracticeInterface from './practice-interface';

export default async function ListeningPage({ params }: { params: Promise<{ sentenceId: string }> }) {
  const { sentenceId } = await params;
  const session = await auth();
  
  if (!session?.user?.id) redirect('/login');

  const admin = getAdminClient();

  // 1. Fetch Sentence
  let sentence;
  try {
      sentence = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'sentences', sentenceId);
  } catch (e) {
      notFound();
  }

  if (!sentence || sentence.deleted_at) notFound();

  // 2. Fetch Material
  let material;
  try {
      material = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'materials', sentence.material_id);
  } catch (e) {
      notFound();
  }

  if (!material || material.user_id !== session.user.id || material.deleted_at) notFound();

  // 3. Fetch Folder (Optional, if needed for UI, but mappedSentence uses it?)
  // The original code fetched folder:folders(*). Let's see if mappedSentence uses it.
  // mappedSentence.material has folderId, but doesn't seem to pass the full folder object down deeply unless PracticeInterface needs it.
  // Looking at the mapping:
  /*
    material: sentence.material ? {
        ...sentence.material,
        ...
    } : null
  */
  // It seems it just spreads it. If PracticeInterface needs folder details, we might need to fetch it.
  // But let's assume for now it just needs the ID or basic material info.

  // 4. Fetch ALL sentences for navigation
  const { documents: allSentences } = await admin.databases.listDocuments(
    APPWRITE_DATABASE_ID,
    'sentences',
    [
        Query.equal('material_id', sentence.material_id),
        Query.isNull('deleted_at'),
        Query.orderAsc('order'),
        Query.orderAsc('start_time'),
        Query.limit(5000) // Appwrite limit is usually 5000
    ]
  );

  let nextId = undefined;
  let prevId = undefined;
  let displayIndex = sentence.order + 1;

  if (allSentences && allSentences.length > 0) {
      const currentIndex = allSentences.findIndex(s => s.$id === sentenceId);
      if (currentIndex !== -1) {
          displayIndex = currentIndex + 1;
          if (currentIndex > 0) {
              prevId = allSentences[currentIndex - 1].$id;
          }
          if (currentIndex < allSentences.length - 1) {
              nextId = allSentences[currentIndex + 1].$id;
          }
      }
  }

  // Map snake_case to camelCase
  const mappedSentence = {
    ...sentence,
    id: sentence.$id,
    content: sentence.edited_content ?? sentence.content,
    originalContent: sentence.content,
    editedContent: sentence.edited_content,
    startTime: sentence.start_time,
    endTime: sentence.end_time,
    materialId: sentence.material_id,
    createdAt: sentence.$createdAt,
    updatedAt: sentence.$updatedAt, // Use system updated at
    material: material ? {
        ...material,
        id: material.$id,
        userId: material.user_id,
        folderId: material.folder_id,
        filePath: material.file_path,
        mimeType: material.mime_type,
        isProcessed: material.is_processed,
        createdAt: material.$createdAt,
        updatedAt: material.$updatedAt,
    } : null
  };

  return (
    <PracticeInterface 
        sentence={mappedSentence} 
        materialId={sentence.material_id}
        nextId={nextId}
        prevId={prevId}
        displayIndex={displayIndex}
    />
  );
}

