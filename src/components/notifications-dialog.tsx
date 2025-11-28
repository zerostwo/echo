"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { 
  Bell, 
  CheckCheck, 
  Upload, 
  CheckCircle2, 
  BookOpen,
  Trophy,
  Info,
  Trash2,
  Loader2,
  ExternalLink,
  BookMarked,
  FileText
} from "lucide-react"
import { cn } from "@/lib/utils"
import { 
  getNotifications, 
  markAsRead, 
  markAllAsRead, 
  clearAllNotifications,
  type Notification,
  type NotificationType
} from "@/actions/notification-actions"
import { toast } from "sonner"
import { formatInTimeZone } from "@/lib/time"
import { useUserSettings } from "./user-settings-provider"

interface NotificationsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  timezone?: string
}

function formatNotificationTime(dateString: string, timezone: string): string {
  const formatted = formatInTimeZone(dateString, timezone, { dateStyle: 'medium', timeStyle: 'short', fallback: 'Just now' })
  return formatted
}

// Icon configuration with consistent styling
const notificationConfig: Record<NotificationType, {
  icon: React.ComponentType<{ className?: string }>
  bgColor: string
  iconColor: string
  label: string
}> = {
  MATERIAL_UPLOADED: {
    icon: Upload,
    bgColor: "bg-blue-100 dark:bg-blue-500/20",
    iconColor: "text-blue-600 dark:text-blue-400",
    label: "Upload"
  },
  MATERIAL_PROCESSED: {
    icon: CheckCircle2,
    bgColor: "bg-emerald-100 dark:bg-emerald-500/20",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    label: "Complete"
  },
  VOCAB_EXTRACTED: {
    icon: BookOpen,
    bgColor: "bg-amber-100 dark:bg-amber-500/20",
    iconColor: "text-amber-600 dark:text-amber-400",
    label: "Vocabulary"
  },
  PRACTICE_MILESTONE: {
    icon: Trophy,
    bgColor: "bg-purple-100 dark:bg-purple-500/20",
    iconColor: "text-purple-600 dark:text-purple-400",
    label: "Milestone"
  },
  SYSTEM: {
    icon: Info,
    bgColor: "bg-slate-100 dark:bg-slate-500/20",
    iconColor: "text-slate-600 dark:text-slate-400",
    label: "System"
  },
}

// Get inline actions based on notification type
function getInlineActions(notification: Notification): Array<{
  label: string
  icon: React.ComponentType<{ className?: string }>
  href: string
}> {
  const actions: Array<{
    label: string
    icon: React.ComponentType<{ className?: string }>
    href: string
  }> = []

  if (notification.relatedId && notification.relatedType === 'material') {
    if (notification.type === 'MATERIAL_UPLOADED') {
      actions.push({
        label: "View Material",
        icon: ExternalLink,
        href: `/materials/${notification.relatedId}`
      })
    }
    
    if (notification.type === 'MATERIAL_PROCESSED') {
      actions.push({
        label: "View Transcript",
        icon: FileText,
        href: `/materials/${notification.relatedId}`
      })
      actions.push({
        label: "Review Vocabulary",
        icon: BookMarked,
        href: `/materials/${notification.relatedId}/vocab`
      })
    }
  }

  if (notification.type === 'VOCAB_EXTRACTED' && notification.relatedId) {
    actions.push({
      label: "Review Vocabulary",
      icon: BookMarked,
      href: `/vocab`
    })
  }

  return actions
}

export function NotificationsDialog({ open, onOpenChange, timezone }: NotificationsDialogProps) {
  const router = useRouter()
  const { timezone: ctxTimezone } = useUserSettings()
  const activeTimezone = timezone || ctxTimezone
  const [notifications, setNotifications] = React.useState<Notification[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [isClearing, setIsClearing] = React.useState(false)

  const fetchNotifications = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getNotifications()
      if (result.notifications) {
        setNotifications(result.notifications)
      } else if (result.error) {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error("Failed to load notifications")
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (open) {
      fetchNotifications()
    }
  }, [open, fetchNotifications])

  const handleMarkAsRead = async (notificationId: string) => {
    const result = await markAsRead(notificationId)
    if (result.success) {
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      )
    } else if (result.error) {
      toast.error(result.error)
    }
  }

  const handleMarkAllAsRead = async () => {
    const result = await markAllAsRead()
    if (result.success) {
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
      toast.success("All notifications marked as read")
    } else if (result.error) {
      toast.error(result.error)
    }
  }

  const handleClearAll = async () => {
    setIsClearing(true)
    try {
      const result = await clearAllNotifications()
      if (result.success) {
        setNotifications([])
        toast.success("All notifications cleared")
      } else if (result.error) {
        toast.error(result.error)
      }
    } finally {
      setIsClearing(false)
    }
  }

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read if not already
    if (!notification.isRead) {
      handleMarkAsRead(notification.id)
    }

    // Navigate based on notification type
    if (notification.relatedId && notification.relatedType === 'material') {
      onOpenChange(false)
      router.push(`/materials/${notification.relatedId}`)
    }
  }

  const handleActionClick = (e: React.MouseEvent, href: string, notificationId: string, isRead: boolean) => {
    e.stopPropagation()
    if (!isRead) {
      handleMarkAsRead(notificationId)
    }
    onOpenChange(false)
    router.push(href)
  }

  const unreadCount = notifications.filter(n => !n.isRead).length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0 [&>button]:hidden">
        {/* Header - Compact design */}
        <SheetHeader className="px-4 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            <div>
              <SheetTitle className="text-sm font-semibold">
                Notifications
              </SheetTitle>
              <p className="text-[11px] text-muted-foreground">
                Your recent activity
              </p>
            </div>
          </div>
        </SheetHeader>

        {/* Content with scrolling */}
        <ScrollArea className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3">
                <Bell className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <h3 className="font-semibold text-sm mb-0.5">No notifications</h3>
              <p className="text-xs text-muted-foreground max-w-[180px]">
                You're all caught up!
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const config = notificationConfig[notification.type] || notificationConfig.SYSTEM
                const Icon = config.icon
                const inlineActions = getInlineActions(notification)
                const isClickable = notification.relatedId && notification.relatedType === 'material'
                
                return (
                  <div
                    key={notification.id}
                    className={cn(
                      "px-4 py-3 transition-colors relative",
                      !notification.isRead && "bg-primary/[0.03]",
                      isClickable && "cursor-pointer hover:bg-muted/50"
                    )}
                    onClick={() => isClickable && handleNotificationClick(notification)}
                  >
                    <div className="flex gap-3">
                      {/* Icon */}
                      <div className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        config.bgColor
                      )}>
                        <Icon className={cn("h-3.5 w-3.5", config.iconColor)} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-0.5">
                        {/* Title row with unread indicator */}
                        <div className="flex items-start gap-2">
                          <h4 className={cn(
                            "text-[13px] leading-tight flex-1",
                            !notification.isRead ? "font-semibold" : "font-medium text-foreground/90"
                          )}>
                            {notification.title}
                          </h4>
                          {!notification.isRead && (
                            <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-red-500 mt-1.5" />
                          )}
                        </div>

                        {/* Message */}
                        <p className="text-xs text-muted-foreground leading-snug">
                          {notification.message}
                        </p>

                        {/* Timestamp */}
                        <p className="text-[11px] text-muted-foreground/60">
                          {formatNotificationTime(notification.createdAt, activeTimezone)}
                        </p>

                        {/* Inline action buttons - displayed below message */}
                        {inlineActions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1.5">
                            {inlineActions.map((action, idx) => {
                              const ActionIcon = action.icon
                              return (
                                <Button
                                  key={idx}
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[11px] font-medium"
                                  onClick={(e) => handleActionClick(e, action.href, notification.id, notification.isRead)}
                                >
                                  <ActionIcon className="h-3 w-3 mr-1" />
                                  {action.label}
                                </Button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer with actions - only show when there are notifications */}
        {notifications.length > 0 && (
          <SheetFooter className="border-t bg-muted/30 grid grid-cols-2 gap-0 p-0">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0}
              className="h-10 rounded-none text-xs font-medium text-muted-foreground hover:text-foreground border-r"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
              Mark all read
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClearAll}
              disabled={isClearing}
              className="h-10 rounded-none text-xs font-medium text-muted-foreground hover:text-destructive"
            >
              {isClearing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Clear all
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
