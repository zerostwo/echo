"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
  FileText,
  X
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
import { formatDistanceToNow } from "date-fns"

// Format notification time - ensure UTC timestamps are handled correctly
function formatNotificationTime(dateString: string): string {
  try {
    // The dateString from database might not include timezone info
    // Ensure we treat it as UTC if no timezone is specified
    let date: Date
    
    if (dateString.endsWith('Z') || dateString.includes('+') || dateString.includes('-')) {
      // Already has timezone info
      date = new Date(dateString)
    } else {
      // No timezone info - treat as UTC by appending 'Z'
      date = new Date(dateString + 'Z')
    }
    
    // Validate the date
    if (isNaN(date.getTime())) {
      return "Just now"
    }
    
    return formatDistanceToNow(date, { addSuffix: true })
  } catch (e) {
    console.error("Failed to format notification time:", e)
    return "Just now"
  }
}

interface NotificationsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  timezone?: string
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
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-between">
            {/* Left: Icon + Title + Badge */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Bell className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="flex items-center gap-2">
                <SheetTitle className="text-base font-semibold">
                  Notifications
                </SheetTitle>
                {unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
                    {unreadCount}
                  </span>
                )}
              </div>
            </div>

            {/* Right: Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Subtitle */}
          <p className="text-xs text-muted-foreground mt-1 ml-12">
            Your recent activity and updates
          </p>
        </SheetHeader>

        {/* Action bar - only show when there are notifications */}
        {notifications.length > 0 && (
          <div className="flex items-center justify-end gap-1 px-5 py-2.5 border-b bg-muted/30">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0}
              className="h-7 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
              Mark all read
            </Button>
            <div className="w-px h-4 bg-border mx-1" />
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClearAll}
              disabled={isClearing}
              className="h-7 px-2.5 text-xs font-medium text-muted-foreground hover:text-destructive"
            >
              {isClearing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Clear all
            </Button>
          </div>
        )}

        {/* Content */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center px-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
                <Bell className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <h3 className="font-semibold text-base mb-1">No notifications</h3>
              <p className="text-sm text-muted-foreground max-w-[200px]">
                You're all caught up! We'll notify you when something happens.
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
                      "px-5 py-4 transition-colors relative",
                      !notification.isRead && "bg-primary/[0.03]",
                      isClickable && "cursor-pointer hover:bg-muted/50"
                    )}
                    onClick={() => isClickable && handleNotificationClick(notification)}
                  >
                    <div className="flex gap-3.5">
                      {/* Icon */}
                      <div className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        config.bgColor
                      )}>
                        <Icon className={cn("h-4 w-4", config.iconColor)} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-1">
                        {/* Title row with unread indicator */}
                        <div className="flex items-start gap-2">
                          <h4 className={cn(
                            "text-sm leading-tight flex-1",
                            !notification.isRead ? "font-semibold" : "font-medium text-foreground/90"
                          )}>
                            {notification.title}
                          </h4>
                          {!notification.isRead && (
                            <span className="shrink-0 h-2 w-2 rounded-full bg-red-500 mt-1.5" />
                          )}
                        </div>

                        {/* Message */}
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {notification.message}
                        </p>

                        {/* Timestamp */}
                        <p className="text-xs text-muted-foreground/60 pt-0.5">
                          {formatNotificationTime(notification.createdAt)}
                        </p>

                        {/* Inline action buttons - displayed below message */}
                        {inlineActions.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            {inlineActions.map((action, idx) => {
                              const ActionIcon = action.icon
                              return (
                                <Button
                                  key={idx}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2.5 text-xs font-medium"
                                  onClick={(e) => handleActionClick(e, action.href, notification.id, notification.isRead)}
                                >
                                  <ActionIcon className="h-3 w-3 mr-1.5" />
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
      </SheetContent>
    </Sheet>
  )
}
