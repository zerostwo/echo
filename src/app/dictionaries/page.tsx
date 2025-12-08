import { getDictionariesPaginated } from "@/actions/dictionary-actions"
import { CreateDictionaryDialog } from "@/components/dictionaries/create-dictionary-dialog"
import { DictionariesClient } from "./dictionaries-client"
import { HeaderPortal } from "@/components/header-portal"
import { SetBreadcrumbs } from "@/components/set-breadcrumbs"
import { auth } from "@/auth"
import { supabaseAdmin, supabase } from "@/lib/supabase"

export default async function DictionariesPage() {
  const session = await auth();
  const client = supabaseAdmin || supabase;

  // Fetch user settings
  let userSettings: any = {};
  if (session?.user?.id) {
    const { data: user } = await client
      .from('users')
      .select('settings')
      .eq('id', session.user.id)
      .single();

    if (user?.settings) {
      try {
        userSettings = JSON.parse(user.settings);
      } catch (e) {
        console.error("Failed to parse user settings", e);
      }
    }
  }

  const pageSize = userSettings.dictionaryPageSize || 10;
  const sortBy = userSettings.dictionarySortBy || 'createdAt';
  const sortOrder = userSettings.dictionarySortOrder || 'desc';

  const initialData = await getDictionariesPaginated(1, pageSize, undefined, sortBy, sortOrder)
  
  if ('error' in initialData) {
      return <div>Error loading dictionaries</div>
  }

  return (
    <div className="py-8 h-full">
      <SetBreadcrumbs items={[
        { title: "Dictionary", href: "/dictionaries" }
      ]} />
      <HeaderPortal>
        <CreateDictionaryDialog />
      </HeaderPortal>

      <DictionariesClient 
        initialData={initialData} 
        initialSortBy={sortBy}
        initialSortOrder={sortOrder}
      />
    </div>
  )
}
