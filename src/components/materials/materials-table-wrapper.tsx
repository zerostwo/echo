"use client"

import { DataTable } from "@/components/materials/data-table"
import { columns } from "@/components/materials/columns"

interface MaterialsTableWrapperProps {
  materials: any[]
  folders: any[]
}

export function MaterialsTableWrapper({ materials, folders }: MaterialsTableWrapperProps) {
  return <DataTable columns={columns(folders)} data={materials} folders={folders} />
}
