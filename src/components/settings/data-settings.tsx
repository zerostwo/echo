"use client"

import * as React from "react"
import { ExportSection } from "./export-section"
import { ImportSection } from "./import-section"
import { Separator } from "@/components/ui/separator"

export function DataSettings() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Export your learning progress and materials, or import data from a backup.
        </p>
      </div>
      <Separator />
      <ExportSection />
      <Separator />
      <ImportSection />
    </div>
  )
}
