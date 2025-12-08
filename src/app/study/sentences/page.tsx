import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { supabaseAdmin, supabase } from "@/lib/supabase"

export default async function StudySentencesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const client = supabaseAdmin || supabase

  // 1. Try to find the last practiced sentence
  const { data: lastPractice } = await client
    .from('practice_progress')
    .select('sentence_id')
    .eq('user_id', session.user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (lastPractice?.sentence_id) {
    redirect(`/study/sentences/${lastPractice.sentence_id}`)
  }

  // 2. If no practice history, find the first sentence of the most recently updated material
  const { data: lastMaterial } = await client
    .from('materials')
    .select('id')
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (lastMaterial) {
      const { data: firstSentence } = await client
        .from('sentences')
        .select('id')
        .eq('material_id', lastMaterial.id)
        .is('deleted_at', null)
        .order('order', { ascending: true })
        .limit(1)
        .single()
      
      if (firstSentence) {
          redirect(`/study/sentences/${firstSentence.id}`)
      }
  }

  // 3. If no materials or sentences, redirect to materials page
  redirect("/materials")
}
