"use client"

import { DataTable } from "@/components/materials/data-table"
import { columns } from "@/components/materials/columns"
import { useUserSettings } from "../user-settings-provider"

interface MaterialsTableWrapperProps {
  materials: any[]
  folders: any[]
}

export function MaterialsTableWrapper({ materials, folders }: MaterialsTableWrapperProps) {
  const { timezone } = useUserSettings()
  return <DataTable columns={columns(folders, timezone)} data={materials} folders={folders} />
}
