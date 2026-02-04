"use client"

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { 
  RefreshCw, 
  Download, 
  Trash2, 
  Upload, 
  GitMerge, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  FileArchive,
  Loader2
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { fetchJson } from "@/lib/api-client"

interface ExportJob {
  id: string
  status: string
  createdAt: string
  filePath: string | null
  error?: string
}

export function DataSettings() {
  const queryClient = useQueryClient()

  // State for Export
  const [exportOptions, setExportOptions] = React.useState({
    user: true,
    vocab: true,
    learning: true,
    dict: true,
    materials: true,
  })
  const [isExporting, setIsExporting] = React.useState(false)
  const [isImporting, setIsImporting] = React.useState(false)
  const [pollingJobId, setPollingJobId] = React.useState<string | null>(null)

  // State for Import
  const [importMode, setImportMode] = React.useState<"merge" | "overwrite">("merge")
  const [importFile, setImportFile] = React.useState<File | null>(null)

  const importMutation = useMutation({
    mutationFn: async ({ file, mode }: { file: File; mode: string }) => {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("mode", mode)

      const res = await fetch("/api/import/upload", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) throw new Error("Upload failed")
      return res.json()
    },
    onSuccess: () => {
      toast.success("Import started")
      toast.info("Import is processing in the background.")
    },
    onError: () => toast.error("Failed to start import"),
    onSettled: () => {
      setIsImporting(false)
      setImportFile(null)
    },
  })

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
        toast.success("Export completed")
      } else {
        toast.error("Export failed")
      }
    }
  }, [exportStatus, queryClient])


  // Handlers
  const handleToggleAll = (checked: boolean) => {
    setExportOptions({
      user: checked,
      vocab: checked,
      learning: checked,
      dict: checked,
      materials: checked,
    })
  }

  const exportMutation = useMutation({
    mutationFn: () =>
      fetchJson<ExportJob>("/api/export/create", {
        method: "POST",
        body: JSON.stringify({ include: exportOptions }),
      }),
    onSuccess: (job) => {
      toast.success("Export started")
      setPollingJobId(job.id)
      queryClient.invalidateQueries({ queryKey: ["export", "history"] })
    },
    onError: () => toast.error("Failed to start export"),
    onSettled: () => setIsExporting(false),
  })

  const downloadMutation = useMutation({
    mutationFn: (jobId: string) => fetchJson<{ url: string }>(`/api/export/download?jobId=${jobId}`),
    onSuccess: ({ url }) => window.open(url, "_blank"),
    onError: () => toast.error("Failed to download export"),
  })

  const deleteMutation = useMutation({
    mutationFn: (jobId: string) =>
      fetchJson(`/api/export/delete?jobId=${jobId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Export deleted")
      queryClient.invalidateQueries({ queryKey: ["export", "history"] })
    },
    onError: () => toast.error("Failed to delete export"),
  })

  const handleExport = () => {
    setIsExporting(true)
    exportMutation.mutate()
  }

  const handleDownload = (jobId: string) => {
    downloadMutation.mutate(jobId)
  }

  const handleDelete = (jobId: string) => {
    deleteMutation.mutate(jobId)
  }

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith(".zip")) {
      setImportFile(file)
    } else {
      toast.error("Please upload a .zip file")
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setImportFile(file)
  }

  const handleImport = async () => {
    if (!importFile) return

    // setUploading(true) // We need a state for this
    // Reuse isExporting or add isImporting? Let's add isImporting
    setIsImporting(true)
    
    importMutation.mutate({ file: importFile, mode: importMode })
  }

  const allSelected = Object.values(exportOptions).every(Boolean)

  return (
    <div className="w-full max-w-4xl mx-auto">
      <Tabs defaultValue="export" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8">
          <TabsTrigger value="export">Export Data</TabsTrigger>
          <TabsTrigger value="import">Import Data</TabsTrigger>
        </TabsList>

        {/* TAB 1: EXPORT DATA */}
        <TabsContent value="export" className="space-y-8">
          
          {/* Section 1: Configure Export Content */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Configure Export Content</h3>
            </div>
            
            <div className="bg-card border rounded-lg p-4 space-y-4">
              <div className="flex items-center space-x-2 pb-4 border-b">
                <Checkbox 
                  id="select-all" 
                  checked={allSelected}
                  onCheckedChange={(c) => handleToggleAll(!!c)}
                />
                <Label htmlFor="select-all" className="font-semibold">Select All</Label>
              </div>

              <div className="grid gap-3">
                {[
                  { id: "user", label: "User Profile & Settings", desc: "Account preferences and avatar" },
                  { id: "vocab", label: "Words (approx. 5MB)", desc: "Vocabulary list and statuses" },
                  { id: "learning", label: "Learning Progress", desc: "Study logs and practice history" },
                  { id: "dict", label: "Dictionaries", desc: "Custom dictionaries" },
                  { id: "materials", label: "Materials", desc: "Uploaded media and transcripts" },
                ].map((item) => (
                  <div key={item.id} className="flex items-start space-x-3">
                    <Checkbox 
                      id={item.id} 
                      checked={exportOptions[item.id as keyof typeof exportOptions]}
                      onCheckedChange={(c) => setExportOptions(prev => ({ ...prev, [item.id]: !!c }))}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor={item.id} className="font-medium cursor-pointer">
                        {item.label}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button 
              className="w-full sm:w-auto" 
              onClick={handleExport}
              disabled={isExporting || !Object.values(exportOptions).some(Boolean)}
            >
              {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Export
            </Button>
          </div>

          {/* Section 2: Recent Exports (History) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Recent Exports</h3>
              <Button variant="ghost" size="sm" onClick={fetchHistory}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Date & Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        No export history found
                      </TableCell>
                    </TableRow>
                  ) : (
                    history.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {format(new Date(job.createdAt), "MMM d, yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {job.status === "finished" ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                <span className="text-sm">Finished</span>
                              </>
                            ) : job.status === "failed" ? (
                              <div className="flex items-center gap-2 min-w-0">
                                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                                <span className="text-red-500 text-sm truncate max-w-[120px] sm:max-w-[200px]" title={job.error || "Failed"}>
                                  Failed {job.error ? `(${job.error})` : ""}
                                </span>
                              </div>
                            ) : (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                                <span className="text-sm">Processing...</span>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {job.status === "finished" && (
                              <Button variant="ghost" size="icon" onClick={() => handleDownload(job.id)}>
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(job.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: IMPORT DATA */}
        <TabsContent value="import" className="space-y-8">
          
          {/* Section 1: Restore from Backup */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Restore from Backup</h3>
            <div 
              className={cn(
                "border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center hover:bg-muted/50 transition-colors cursor-pointer",
                importFile && "border-primary/50 bg-primary/5"
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => document.getElementById("file-upload")?.click()}
            >
              <input 
                id="file-upload" 
                type="file" 
                className="hidden" 
                accept=".zip"
                onChange={handleFileSelect}
              />
              <div className="flex flex-col items-center gap-2">
                {importFile ? (
                  <>
                    <FileArchive className="h-10 w-10 text-primary" />
                    <p className="font-medium">{importFile.name}</p>
                    <p className="text-sm text-muted-foreground">{(importFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <p className="font-medium">Click or drag file to this area to upload (.zip)</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Import Mode */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Import Mode</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div 
                className={cn(
                  "cursor-pointer border rounded-lg p-4 flex items-start gap-4 hover:bg-muted/50 transition-all",
                  importMode === "merge" && "ring-2 ring-primary border-primary"
                )}
                onClick={() => setImportMode("merge")}
              >
                <div className="p-2 bg-blue-100 text-blue-600 rounded-md">
                  <GitMerge className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-medium">Merge</h4>
                  <p className="text-sm text-muted-foreground">Keep existing data, add new items.</p>
                </div>
              </div>

              <div 
                className={cn(
                  "cursor-pointer border rounded-lg p-4 flex items-start gap-4 hover:bg-muted/50 transition-all",
                  importMode === "overwrite" && "ring-2 ring-destructive border-destructive bg-destructive/5"
                )}
                onClick={() => setImportMode("overwrite")}
              >
                <div className="p-2 bg-red-100 text-red-600 rounded-md">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-medium text-destructive">Overwrite</h4>
                  <p className="text-sm text-muted-foreground">Delete all existing data and replace.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Action */}
          <Button 
            className="w-full sm:w-auto" 
            disabled={!importFile || isImporting}
            variant={importMode === "overwrite" ? "destructive" : "default"}
            onClick={handleImport}
          >
            {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start Import
          </Button>

        </TabsContent>
      </Tabs>
    </div>
  )
}
