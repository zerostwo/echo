"use client"

import * as React from "react"
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

// Mock Data for History
const MOCK_HISTORY = [
  {
    id: "1",
    createdAt: new Date("2025-12-08T21:07:00"),
    status: "finished",
    size: "12.5 MB",
  },
  {
    id: "2",
    createdAt: new Date("2025-12-07T14:30:00"),
    status: "failed",
    error: "Network Error",
  },
  {
    id: "3",
    createdAt: new Date("2025-12-06T09:15:00"),
    status: "finished",
    size: "11.2 MB",
  },
]

interface ExportJob {
  id: string
  status: string
  createdAt: string
  filePath: string | null
  error?: string
}

export function DataSettings() {
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
  const [history, setHistory] = React.useState<ExportJob[]>([])
  const [pollingJobId, setPollingJobId] = React.useState<string | null>(null)

  // State for Import
  const [importMode, setImportMode] = React.useState<"merge" | "overwrite">("merge")
  const [importFile, setImportFile] = React.useState<File | null>(null)

  // Fetch History
  const fetchHistory = React.useCallback(async () => {
    try {
      const res = await fetch("/api/export/history")
      if (res.ok) {
        const data = await res.json()
        // If no data from API, use mock data for demonstration if needed, 
        // but in production we should use real data.
        // For now, let's append mock data if the list is empty to show the UI as requested
        if (data.length === 0 && process.env.NODE_ENV === 'development') {
             // setHistory(MOCK_HISTORY as any) // Uncomment to force mock data
             setHistory(data)
        } else {
             setHistory(data)
        }
        
        // Check for processing jobs
        const processingJob = data.find((job: ExportJob) => job.status === "processing" || job.status === "queued")
        if (processingJob) {
            setPollingJobId(processingJob.id)
        }
      }
    } catch (error) {
      console.error("Failed to fetch history", error)
    }
  }, [])

  React.useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // Polling
  React.useEffect(() => {
    if (!pollingJobId) return

    const interval = setInterval(async () => {
        try {
            const res = await fetch(`/api/export/status?jobId=${pollingJobId}`)
            if (res.ok) {
                const job = await res.json()
                if (job.status === "finished" || job.status === "failed") {
                    setPollingJobId(null)
                    fetchHistory()
                    if (job.status === "finished") {
                        toast.success("Export completed")
                    } else {
                        toast.error("Export failed")
                    }
                }
            }
        } catch (e) {
            // ignore
        }
    }, 2000)

    return () => clearInterval(interval)
  }, [pollingJobId, fetchHistory])


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

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const res = await fetch("/api/export/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ include: exportOptions }),
      })
      
      if (!res.ok) throw new Error("Failed to start export")
      
      const job = await res.json()
      toast.success("Export started")
      setPollingJobId(job.id)
      fetchHistory()
    } catch (error) {
      toast.error("Failed to start export")
    } finally {
      setIsExporting(false)
    }
  }

  const handleDownload = async (jobId: string) => {
    try {
      const res = await fetch(`/api/export/download?jobId=${jobId}`)
      if (!res.ok) throw new Error("Failed to get download URL")
      const { url } = await res.json()
      window.open(url, "_blank")
    } catch (error) {
      toast.error("Failed to download export")
    }
  }

  const handleDelete = async (jobId: string) => {
    try {
      const res = await fetch(`/api/export/delete?jobId=${jobId}`, {
        method: "DELETE",
      })
      
      if (!res.ok) throw new Error("Failed to delete export")
      
      toast.success("Export deleted")
      // Optimistically update UI
      setHistory(prev => prev.filter(job => job.id !== jobId))
      // Or refetch
      // fetchHistory()
    } catch (error) {
      toast.error("Failed to delete export")
    }
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
    
    try {
      const formData = new FormData()
      formData.append("file", importFile)
      formData.append("mode", importMode)

      const res = await fetch("/api/import/upload", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) throw new Error("Upload failed")
      
      const job = await res.json()
      toast.success("Import started")
      
      // Start polling for import status
      // We can reuse the polling mechanism but we need to know if it's import or export
      // The current polling logic is tied to export history.
      // Let's add a simple separate polling for import or just show a toast.
      // For better UX, we should probably track it.
      
      // For now, just notify user.
      toast.info("Import is processing in the background.")
      
    } catch (error) {
      toast.error("Failed to start import")
    } finally {
      setIsImporting(false)
      setImportFile(null)
    }
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
