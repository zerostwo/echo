"use client"

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { Loader2, Download, FileArchive, CheckCircle2, AlertCircle } from "lucide-react"
import { format } from "date-fns"
import { Progress } from "@/components/ui/progress"
import { fetchJson } from "@/lib/api-client"

interface ExportJob {
  id: string
  status: string
  createdAt: string
  filePath: string | null
}

export function ExportSection() {
  const queryClient = useQueryClient()
  const [loading, setLoading] = React.useState(false)
  const [options, setOptions] = React.useState({
    learning: true,
    vocab: true,
    dict: true,
    materials: true,
    user: true,
  })
  const [pollingJobId, setPollingJobId] = React.useState<string | null>(null)

  const { data: history = [] } = useQuery({
    queryKey: ["export", "history"],
    queryFn: () => fetchJson<ExportJob[]>("/api/export/history"),
  })

  React.useEffect(() => {
    if (pollingJobId) return
    const processingJob = history.find((job: ExportJob) => job.status === "processing" || job.status === "queued")
    if (processingJob) setPollingJobId(processingJob.id)
  }, [history, pollingJobId])

  const { data: exportStatus } = useQuery({
    queryKey: ["export", "status", pollingJobId],
    queryFn: () => fetchJson<ExportJob>(`/api/export/status?jobId=${pollingJobId}`),
    enabled: !!pollingJobId,
    refetchInterval: 2000,
  })

  React.useEffect(() => {
    if (!exportStatus) return
    if (exportStatus.status === "finished" || exportStatus.status === "failed") {
      setPollingJobId(null)
      queryClient.invalidateQueries({ queryKey: ["export", "history"] })
      if (exportStatus.status === "finished") {
        toast.success("Export completed successfully", {
          action: {
            label: "Download",
            onClick: () => handleDownload(exportStatus.id),
          },
        })
      } else {
        toast.error("Export failed")
      }
    }
  }, [exportStatus, queryClient])

  const exportMutation = useMutation({
    mutationFn: () =>
      fetchJson<ExportJob>("/api/export/create", {
        method: "POST",
        body: JSON.stringify({ include: options }),
      }),
    onSuccess: (job) => {
      toast.success("Export started")
      setPollingJobId(job.id)
      queryClient.invalidateQueries({ queryKey: ["export", "history"] })
    },
    onError: () => toast.error("Failed to start export"),
    onSettled: () => setLoading(false),
  })

  const downloadMutation = useMutation({
    mutationFn: (jobId: string) => fetchJson<{ url: string }>(`/api/export/download?jobId=${jobId}`),
    onSuccess: ({ url }) => window.open(url, "_blank"),
    onError: () => toast.error("Failed to download export"),
  })

  const handleExport = () => {
    setLoading(true)
    exportMutation.mutate()
  }

  const handleDownload = (jobId: string) => {
    downloadMutation.mutate(jobId)
  }

  const allSelected = Object.values(options).every(Boolean)
  const toggleAll = () => {
    const newValue = !allSelected
    setOptions({
      learning: newValue,
      vocab: newValue,
      dict: newValue,
      materials: newValue,
      user: newValue,
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-base font-medium">Export Data</h3>
        <p className="text-sm text-muted-foreground">
          Select the data you want to export. The export will be generated as a ZIP file.
        </p>
        
        <div className="space-y-4">
          <div className="flex items-center space-x-2 mb-4">
            <Checkbox 
              id="select-all" 
              checked={allSelected}
              onCheckedChange={toggleAll}
            />
            <Label htmlFor="select-all" className="font-medium">Select All</Label>
          </div>
          
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-start space-x-3 p-3 border rounded-md hover:bg-muted/50 transition-colors">
              <Checkbox 
                id="opt-user" 
                checked={options.user}
                onCheckedChange={(c) => setOptions(prev => ({ ...prev, user: !!c }))}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="opt-user" className="font-medium cursor-pointer">User Profile & Settings</Label>
                <p className="text-xs text-muted-foreground">Your account preferences, avatar, and settings.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 border rounded-md hover:bg-muted/50 transition-colors">
              <Checkbox 
                id="opt-vocab" 
                checked={options.vocab}
                onCheckedChange={(c) => setOptions(prev => ({ ...prev, vocab: !!c }))}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="opt-vocab" className="font-medium cursor-pointer">Words</Label>
                <p className="text-xs text-muted-foreground">Your saved vocabulary list and word statuses.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 border rounded-md hover:bg-muted/50 transition-colors">
              <Checkbox 
                id="opt-learning" 
                checked={options.learning}
                onCheckedChange={(c) => setOptions(prev => ({ ...prev, learning: !!c }))}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="opt-learning" className="font-medium cursor-pointer">Learning Progress</Label>
                <p className="text-xs text-muted-foreground">Study logs, FSRS scheduling data, and practice history.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 border rounded-md hover:bg-muted/50 transition-colors">
              <Checkbox 
                id="opt-dict" 
                checked={options.dict}
                onCheckedChange={(c) => setOptions(prev => ({ ...prev, dict: !!c }))}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="opt-dict" className="font-medium cursor-pointer">Dictionaries</Label>
                <p className="text-xs text-muted-foreground">Your custom dictionaries and word collections.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 border rounded-md hover:bg-muted/50 transition-colors">
              <Checkbox 
                id="opt-materials" 
                checked={options.materials}
                onCheckedChange={(c) => setOptions(prev => ({ ...prev, materials: !!c }))}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="opt-materials" className="font-medium cursor-pointer">Materials</Label>
                <p className="text-xs text-muted-foreground">Uploaded media files, transcripts, and metadata.</p>
              </div>
            </div>
          </div>
        </div>

        <Button onClick={handleExport} disabled={loading || !Object.values(options).some(Boolean)}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Start Export
        </Button>
      </div>

      {history.length > 0 && (
        <div className="space-y-4 pt-4">
          <h4 className="text-sm font-medium">Recent Exports</h4>
          <div className="space-y-3">
            {history.map((job) => (
              <div key={job.id} className="flex flex-col p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                            job.status === 'finished' ? 'bg-green-100 text-green-600' :
                            job.status === 'failed' ? 'bg-red-100 text-red-600' :
                            'bg-blue-100 text-blue-600'
                        }`}>
                            {job.status === 'finished' ? <CheckCircle2 className="h-4 w-4" /> :
                             job.status === 'failed' ? <AlertCircle className="h-4 w-4" /> :
                             <Loader2 className="h-4 w-4 animate-spin" />}
                        </div>
                        <div className="flex flex-col">
                            <span className="font-medium text-sm">Export {format(new Date(job.createdAt), "MMM d, yyyy HH:mm")}</span>
                            <span className="text-xs text-muted-foreground capitalize">{job.status}</span>
                        </div>
                    </div>
                    {job.status === 'finished' && (
                        <Button variant="outline" size="sm" onClick={() => handleDownload(job.id)}>
                            <Download className="h-4 w-4 mr-2" />
                            Download
                        </Button>
                    )}
                </div>
                {(job.status === 'processing' || job.status === 'queued') && (
                    <div className="w-full mt-2">
                        <Progress value={undefined} className="h-1" />
                    </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
