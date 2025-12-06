import { getDictionariesPaginated } from "@/actions/dictionary-actions"
import { CreateDictionaryDialog } from "@/components/dictionaries/create-dictionary-dialog"
import { DictionariesClient } from "./dictionaries-client"
import { HeaderPortal } from "@/components/header-portal"
import { SetBreadcrumbs } from "@/components/set-breadcrumbs"

export default async function DictionariesPage() {
  const initialData = await getDictionariesPaginated(1, 10)
  
  if ('error' in initialData) {
      return <div>Error loading dictionaries</div>
  }

  return (
    <div className="p-8 h-full">
      <SetBreadcrumbs items={[
        { title: "Dictionary", href: "/dictionaries" }
      ]} />
      <HeaderPortal>
        <CreateDictionaryDialog />
      </HeaderPortal>

      <DictionariesClient initialData={initialData} />
    </div>
  )
}
