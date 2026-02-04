"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Loader2, Upload, AlertTriangle } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useMutation, useQuery } from "@tanstack/react-query"
import { fetchJson } from "@/lib/api-client"

export function ImportSection() {
  const [file, setFile] = React.useState<File | null>(null)
  const [mode, setMode] = React.useState<"merge" | "overwrite">("merge")
  const [uploading, setUploading] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [jobId, setJobId] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const { data: importStatus } = useQuery({
    queryKey: ["import", "status", jobId],
    queryFn: () => fetchJson<{ status: string; error?: string }>(`/api/import/status?jobId=${jobId}`),
    enabled: !!jobId,
    refetchInterval: 2000,
  })

  React.useEffect(() => {
    if (!importStatus) return
    setStatus(importStatus.status)
    if (importStatus.status === "finished" || importStatus.status === "failed") {
      setUploading(false)
      if (importStatus.status === "finished") toast.success("Import completed successfully")
      else toast.error(`Import failed: ${importStatus.error || "Unknown error"}`)
    }
  }, [importStatus])

  const importMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData()
      formData.append("file", file as File)
      formData.append("mode", mode)

      // Simulate upload progress
      const interval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90))
      }, 500)

      const res = await fetch("/api/import/upload", {
        method: "POST",
        body: formData,
      })

      clearInterval(interval)
      setProgress(100)

      if (!res.ok) throw new Error("Upload failed")
      return res.json()
    },
    onSuccess: (job) => {
      setJobId(job.id)
      setStatus(job.status)
      toast.success("Import started")
    },
    onError: () => {
      toast.error("Failed to start import")
      setUploading(false)
    },
  })

  const handleImport = async () => {
    if (!file) return

    setUploading(true)
    setProgress(0)
    importMutation.mutate()
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-base font-medium">Import Data</h3>
        <p className="text-sm text-muted-foreground">
          Restore data from an Echo export file.
        </p>

        <div className="space-y-4 border rounded-lg p-4">
          <div className="space-y-2">
            <Label htmlFor="file-upload">Select Export File (ZIP)</Label>
            <Input 
              id="file-upload" 
              type="file" 
              accept=".zip" 
              onChange={handleFileChange}
              disabled={uploading}
            />
          </div>

          <div className="space-y-3 pt-2">
            <Label>Import Mode</Label>
            <div className="flex flex-col space-y-2">
               <div className="flex items-center space-x-2">
                 <input 
                    type="radio" 
                    id="mode-merge" 
                    name="mode" 
                    value="merge" 
                    checked={mode === "merge"}
                    onChange={() => setMode("merge")}
                    disabled={uploading}
                    className="h-4 w-4"
                 />
                 <Label htmlFor="mode-merge" className="font-normal">
                    Merge (Keep existing data, add new items)
                 </Label>
               </div>
               <div className="flex items-center space-x-2">
                 <input 
                    type="radio" 
                    id="mode-overwrite" 
                    name="mode" 
                    value="overwrite" 
                    checked={mode === "overwrite"}
                    onChange={() => setMode("overwrite")}
                    disabled={uploading}
                    className="h-4 w-4"
                 />
                 <Label htmlFor="mode-overwrite" className="font-normal text-red-600">
                    Overwrite (Delete existing data and replace)
                 </Label>
               </div>
            </div>
          </div>

          {mode === "overwrite" && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                This will permanently delete your current data in the selected categories before importing. This action cannot be undone.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {uploading && (
          <div className="space-y-2">
             <div className="flex justify-between text-sm">
                <span>Status: {status || "Uploading..."}</span>
                <span>{progress}%</span>
             </div>
             <Progress value={progress} />
          </div>
        )}

        <Button onClick={handleImport} disabled={!file || uploading} variant={mode === "overwrite" ? "destructive" : "default"}>
          {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {uploading ? "Processing..." : "Start Import"}
        </Button>
      </div>
    </div>
  )
}
