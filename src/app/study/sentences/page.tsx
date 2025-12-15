import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getAdminClient, APPWRITE_DATABASE_ID, Query } from "@/lib/appwrite"

export default async function StudySentencesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const admin = getAdminClient();
  const userId = session.user.id;

  // 1. Try to find the last practiced sentence
  try {
      const { documents: lastPractice } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'practice_progress',
          [
              Query.equal('user_id', userId),
              Query.orderDesc('$updatedAt'), // Appwrite uses $updatedAt for system update time, or we can use a custom field if we have one.
              // The schema has 'updated_at' in some tables but practice_progress doesn't seem to have it explicitly in my setup script?
              // Let's check setup-appwrite.js again. It has 'score', 'attempts', 'duration'. No 'updated_at'.
              // But Appwrite documents always have $updatedAt.
              Query.limit(1)
          ]
      );

      if (lastPractice.length > 0 && lastPractice[0].sentence_id) {
        redirect(`/study/sentences/${lastPractice[0].sentence_id}`)
      }
  } catch (e) {
      console.error("Error fetching practice progress:", e);
  }

  // 2. If no practice history, find the first sentence of the most recently updated material
  try {
      const { documents: lastMaterial } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'materials',
          [
              Query.equal('user_id', userId),
              Query.isNull('deleted_at'),
              Query.orderDesc('$updatedAt'), // Use system updated at
              Query.limit(1)
          ]
      );

      if (lastMaterial.length > 0) {
          const materialId = lastMaterial[0].$id;
          
          const { documents: firstSentence } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'sentences',
            [
                Query.equal('material_id', materialId),
                Query.isNull('deleted_at'),
                Query.orderAsc('order'),
                Query.orderAsc('start_time'),
                Query.limit(1)
            ]
          );
          
          if (firstSentence.length > 0) {
              redirect(`/study/sentences/${firstSentence[0].$id}`)
          }
      }
  } catch (e) {
      console.error("Error fetching materials/sentences:", e);
  }

  // 3. If no materials or sentences, redirect to materials page
  redirect("/materials")
}

