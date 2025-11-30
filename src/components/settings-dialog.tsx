"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { AccountForm } from "@/components/account-form"
import { SecuritySettings } from "@/components/settings/security-settings"
import { updateSettings } from "@/actions/user-actions"
import { toast } from "sonner"
import { Loader2, Settings, User, Book, Bell, Shield, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: any
  initialSettings: any
  defaultTab?: string
}

const WHISPER_ENGINES = [
  { 
    value: "faster-whisper", 
    label: "Faster Whisper (Recommended)",
    description: "Faster inference with VAD support"
  },
  { 
    value: "openai-whisper", 
    label: "OpenAI Whisper",
    description: "Original OpenAI implementation"
  },
]

const WHISPER_MODELS = [
  { value: "tiny", label: "Tiny", description: "~1GB VRAM, fastest, lowest accuracy" },
  { value: "base", label: "Base", description: "~1GB VRAM, balanced speed/accuracy" },
  { value: "small", label: "Small", description: "~2GB VRAM, better accuracy" },
  { value: "medium", label: "Medium", description: "~5GB VRAM, good accuracy" },
  { value: "large-v2", label: "Large V2", description: "~10GB VRAM, best accuracy" },
  { value: "large-v3", label: "Large V3", description: "~10GB VRAM, latest & best" },
  { value: "turbo", label: "Turbo", description: "Optimized for speed (OpenAI only)" },
]

const COMPUTE_TYPES = [
  { value: "auto", label: "Auto", description: "Automatically select best option" },
  { value: "float16", label: "Float16", description: "GPU with FP16 support" },
  { value: "int8", label: "Int8", description: "CPU or low-memory GPU" },
  { value: "int8_float16", label: "Int8 + Float16", description: "Mixed precision" },
]

const DEVICES = [
  { value: "auto", label: "Auto", description: "Use GPU if available" },
  { value: "cuda", label: "CUDA GPU", description: "NVIDIA GPU acceleration" },
  { value: "cpu", label: "CPU", description: "CPU only (slower)" },
]

const LANGUAGES = [
  { value: "auto", label: "Auto Detect" },
  { value: "en", label: "English" },
  { value: "zh", label: "Chinese" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "ru", label: "Russian" },
  { value: "pt", label: "Portuguese" },
  { value: "it", label: "Italian" },
  { value: "ar", label: "Arabic" },
]

const VOCAB_COLUMNS = [
  { id: "word", label: "Word" },
  { id: "translation", label: "Translation" },
  { id: "definition", label: "Definition" },
  { id: "example", label: "Example" },
  { id: "pronunciation", label: "Pronunciation" },
]

// Common timezones list
const TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Europe/Moscow", label: "Moscow" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Kolkata", label: "Mumbai, New Delhi" },
  { value: "Asia/Bangkok", label: "Bangkok" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Hong_Kong", label: "Hong Kong" },
  { value: "Asia/Shanghai", label: "Beijing, Shanghai" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Seoul", label: "Seoul" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Australia/Melbourne", label: "Melbourne" },
  { value: "Pacific/Auckland", label: "Auckland" },
]

function InfoTooltip({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-4 w-4 text-muted-foreground cursor-help inline-block ml-1" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function SettingsDialog({
  open,
  onOpenChange,
  user,
  initialSettings,
  defaultTab = "general",
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = React.useState(defaultTab)
  const [isLoading, setIsLoading] = React.useState(false)
  const [settings, setSettings] = React.useState(initialSettings || {})

  // Reset tab when dialog opens/closes or defaultTab changes
  React.useEffect(() => {
    if (open) {
      setActiveTab(defaultTab)
    }
  }, [open, defaultTab])

  const handleSave = async () => {
    setIsLoading(true)
    try {
      const res = await updateSettings(settings)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success("Settings saved successfully")
        onOpenChange(false)
      }
    } catch (err) {
      toast.error("Failed to save settings")
    } finally {
      setIsLoading(false)
    }
  }

  // Ensure vocab settings exist
  const vocabColumns = settings.vocabColumns || ["word", "translation"]
  const vocabSortBy = settings.vocabSortBy || "date_added"
  const vocabShowMastered = settings.vocabShowMastered ?? false

  // Whisper settings with defaults
  const whisperEngine = settings.whisperEngine || "faster-whisper"
  const whisperModel = settings.whisperModel || "base"
  const whisperLanguage = settings.whisperLanguage || "auto"
  const whisperVadFilter = settings.whisperVadFilter ?? true
  const whisperComputeType = settings.whisperComputeType || "auto"
  const whisperDevice = settings.whisperDevice || "auto"

  const items = [
    {
      title: "General",
      icon: Settings,
      id: "general",
    },
    {
      title: "Account",
      icon: User,
      id: "account",
    },
    {
      title: "Vocabulary",
      icon: Book,
      id: "vocabulary",
    },
    {
      title: "Security",
      icon: Shield,
      id: "security",
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 md:h-[600px] md:max-h-[600px] md:max-w-[700px] lg:max-w-[800px]" showCloseButton={false}>
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Customize your settings
        </DialogDescription>
        
        <SidebarProvider className="items-stretch min-h-0 h-full" style={{ minHeight: 0 }}>
          <Sidebar collapsible="none" className="hidden w-48 border-r md:flex">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          isActive={activeTab === item.id}
                          onClick={() => setActiveTab(item.id)}
                        >
                          <item.icon />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          
          <main className="flex h-full flex-1 flex-col overflow-hidden min-h-0">
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
              <div className="flex flex-1 items-center gap-2">
                <h1 className="text-lg font-semibold">
                  {items.find((i) => i.id === activeTab)?.title}
                </h1>
              </div>
              {activeTab === "account" && (
                <div className="flex items-center gap-2">
                  <Button size="sm" type="submit" form="account-form">
                    Save
                  </Button>
                </div>
              )}
              {activeTab !== "account" && activeTab !== "security" && (
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleSave} disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                </div>
              )}
            </header>
            
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {activeTab === "general" && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Select
                      value={settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
                      onValueChange={(value) =>
                        setSettings({ ...settings, timezone: value })
                      }
                    >
                      <SelectTrigger id="timezone">
                        <SelectValue placeholder="Select your timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Used for displaying notification times and daily activity.
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="pronunciation-accent">Pronunciation Accent</Label>
                    <Select
                      value={settings.pronunciationAccent || "us"}
                      onValueChange={(value) =>
                        setSettings({ ...settings, pronunciationAccent: value })
                      }
                    >
                      <SelectTrigger id="pronunciation-accent">
                        <SelectValue placeholder="Select accent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us">American English (US)</SelectItem>
                        <SelectItem value="uk">British English (UK)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Choose the accent for word pronunciation playback.
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="text-base font-medium">Whisper Transcription Settings</h3>
                    
                    <div className="space-y-2">
                      <Label htmlFor="whisper-engine">
                        Transcription Engine
                        <InfoTooltip>
                          Faster Whisper offers better performance and VAD support for filtering silence.
                          OpenAI Whisper is the original implementation.
                        </InfoTooltip>
                      </Label>
                      <Select
                        value={whisperEngine}
                        onValueChange={(value) =>
                          setSettings({ ...settings, whisperEngine: value })
                        }
                      >
                        <SelectTrigger id="whisper-engine">
                          <SelectValue placeholder="Select engine">
                            {WHISPER_ENGINES.find(e => e.value === whisperEngine)?.label}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {WHISPER_ENGINES.map((engine) => (
                            <SelectItem key={engine.value} value={engine.value}>
                              <div className="flex flex-col items-start">
                                <span>{engine.label}</span>
                                <span className="text-xs text-muted-foreground">{engine.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="whisper-model">
                        Whisper Model
                        <InfoTooltip>
                          Larger models provide better accuracy but require more VRAM and take longer to process.
                        </InfoTooltip>
                      </Label>
                      <Select
                        value={whisperModel}
                        onValueChange={(value) =>
                          setSettings({ ...settings, whisperModel: value })
                        }
                      >
                        <SelectTrigger id="whisper-model">
                          <SelectValue placeholder="Select a model">
                            {WHISPER_MODELS.find(m => m.value === whisperModel)?.label}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {WHISPER_MODELS.map((model) => (
                            <SelectItem key={model.value} value={model.value}>
                              <div className="flex flex-col items-start">
                                <span>{model.label}</span>
                                <span className="text-xs text-muted-foreground">{model.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="whisper-language">
                        Language
                        <InfoTooltip>
                          Specify the audio language for better accuracy, or leave as Auto Detect.
                        </InfoTooltip>
                      </Label>
                      <Select
                        value={whisperLanguage}
                        onValueChange={(value) => {
                          // Store "auto" in settings, but pass undefined to transcription
                          setSettings({ ...settings, whisperLanguage: value })
                        }}
                      >
                        <SelectTrigger id="whisper-language">
                          <SelectValue placeholder="Auto Detect" />
                        </SelectTrigger>
                        <SelectContent>
                          {LANGUAGES.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>
                              {lang.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {whisperEngine === "faster-whisper" && (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor="vad-filter">
                              VAD Filter (Voice Activity Detection)
                              <InfoTooltip>
                                Automatically removes silent segments from audio before transcription,
                                improving speed and accuracy.
                              </InfoTooltip>
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Filter out silence segments for better results.
                            </p>
                          </div>
                          <Switch
                            id="vad-filter"
                            checked={whisperVadFilter}
                            onCheckedChange={(checked) =>
                              setSettings({ ...settings, whisperVadFilter: checked })
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="compute-type">
                            Compute Type
                            <InfoTooltip>
                              Controls precision/speed tradeoff. Float16 is fastest on GPU,
                              Int8 works better on CPU or limited VRAM.
                            </InfoTooltip>
                          </Label>
                          <Select
                            value={whisperComputeType}
                            onValueChange={(value) =>
                              setSettings({ ...settings, whisperComputeType: value })
                            }
                          >
                            <SelectTrigger id="compute-type">
                              <SelectValue placeholder="Auto">
                                {COMPUTE_TYPES.find(ct => ct.value === whisperComputeType)?.label}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {COMPUTE_TYPES.map((ct) => (
                                <SelectItem key={ct.value} value={ct.value}>
                                  <div className="flex flex-col items-start">
                                    <span>{ct.label}</span>
                                    <span className="text-xs text-muted-foreground">{ct.description}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="device">
                            Device
                            <InfoTooltip>
                              Select which device to use for transcription. CUDA requires NVIDIA GPU.
                            </InfoTooltip>
                          </Label>
                          <Select
                            value={whisperDevice}
                            onValueChange={(value) =>
                              setSettings({ ...settings, whisperDevice: value })
                            }
                          >
                            <SelectTrigger id="device">
                              <SelectValue placeholder="Auto">
                                {DEVICES.find(d => d.value === whisperDevice)?.label}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {DEVICES.map((d) => (
                                <SelectItem key={d.value} value={d.value}>
                                  <div className="flex flex-col items-start">
                                    <span>{d.label}</span>
                                    <span className="text-xs text-muted-foreground">{d.description}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "vocabulary" && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <Label className="text-base">Data Table Columns</Label>
                    <div className="grid gap-4">
                      {VOCAB_COLUMNS.map((column) => (
                        <div key={column.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`col-${column.id}`}
                            checked={vocabColumns.includes(column.id)}
                            onCheckedChange={(checked) => {
                              const newCols = checked
                                ? [...vocabColumns, column.id]
                                : vocabColumns.filter((c: string) => c !== column.id)
                              setSettings({ ...settings, vocabColumns: newCols })
                            }}
                          />
                          <Label htmlFor={`col-${column.id}`}>{column.label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="vocab-sort">Default Sort Order</Label>
                    <Select
                      value={vocabSortBy}
                      onValueChange={(value) =>
                        setSettings({ ...settings, vocabSortBy: value })
                      }
                    >
                      <SelectTrigger id="vocab-sort">
                        <SelectValue placeholder="Select sort order" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date_added">Date Added (Newest First)</SelectItem>
                        <SelectItem value="date_added_asc">Date Added (Oldest First)</SelectItem>
                        <SelectItem value="alphabetical">Alphabetical (A-Z)</SelectItem>
                        <SelectItem value="alphabetical_desc">Alphabetical (Z-A)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="show-mastered">Show Mastered Words</Label>
                      <p className="text-sm text-muted-foreground">
                        Include words you have already mastered in the table.
                      </p>
                    </div>
                    <Switch
                      id="show-mastered"
                      checked={vocabShowMastered}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, vocabShowMastered: checked })
                      }
                    />
                  </div>
                </div>
              )}

              {activeTab === "account" && (
                 <div className="space-y-6">
                    <AccountForm user={user} />
                 </div>
              )}

              {activeTab === "security" && (
                <div className="space-y-6">
                  <SecuritySettings twoFactorEnabled={user.twoFactorEnabled} />
                </div>
              )}
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}
