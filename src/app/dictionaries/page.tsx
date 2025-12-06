import { getDictionaries } from "@/actions/dictionary-actions"
import { CreateDictionaryDialog } from "@/components/dictionaries/create-dictionary-dialog"
import { DictionariesTable } from "@/components/dictionaries/dictionaries-table"
import { columns } from "@/components/dictionaries/columns"
import { HeaderPortal } from "@/components/header-portal"
import { SetBreadcrumbs } from "@/components/set-breadcrumbs"

export default async function DictionariesPage() {
  const dictionaries = await getDictionaries()

  return (
    <div className="p-8 h-full">
      <SetBreadcrumbs items={[
        { title: "Dictionary", href: "/dictionaries" }
      ]} />
      <HeaderPortal>
        <CreateDictionaryDialog />
      </HeaderPortal>

      <DictionariesTable columns={columns} data={dictionaries} />
    </div>
  )
}
