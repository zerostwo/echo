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
import { Loader2, Settings, User, Book, Bell, Shield } from "lucide-react"
import { cn } from "@/lib/utils"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: any
  initialSettings: any
  defaultTab?: string
}

const WHISPER_MODELS = [
  { value: "tiny", label: "Tiny (Fastest, lowest accuracy)" },
  { value: "base", label: "Base (Balanced)" },
  { value: "small", label: "Small (Better accuracy)" },
  { value: "medium", label: "Medium (Good accuracy, slower)" },
  { value: "large", label: "Large (Best accuracy, slow)" },
  { value: "turbo", label: "Turbo (Optimized)" },
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
      <DialogContent className="overflow-hidden p-0 md:h-[500px] md:max-h-[500px] md:max-w-[700px] lg:max-w-[800px]" showCloseButton={false}>
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
                    <Label htmlFor="model">Whisper Model</Label>
                    <Select
                      value={settings.whisperModel || "base"}
                      onValueChange={(value) =>
                        setSettings({ ...settings, whisperModel: value })
                      }
                    >
                      <SelectTrigger id="model">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {WHISPER_MODELS.map((model) => (
                          <SelectItem key={model.value} value={model.value}>
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Larger models provide better accuracy but take longer to process.
                    </p>
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

