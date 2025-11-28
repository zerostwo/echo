"use client"

import { useActionState, useState, useRef, useEffect } from "react"
import { updateUser, uploadAvatar } from "@/actions/user-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Camera, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export function AccountForm({ user }: { user: any }) {
  const [state, formAction, isPending] = useActionState(updateUser, null)
  const [avatarUrl, setAvatarUrl] = useState(user.avatar || user.image || "")
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Show toast notifications when state changes
  useEffect(() => {
    if (state?.success) {
      // Check if email verification was triggered
      if (state.success.includes("verification email")) {
        toast.success(state.success, {
          duration: 6000, // Show longer for email verification message
        })
      } else {
        toast.success(state.success)
      }
      router.refresh()
    } else if (state?.error && typeof state.error === 'string') {
      toast.error(state.error)
    }
  }, [state, router])

  const getErrorMessage = (field: string) => {
      if (state?.error && typeof state.error !== 'string') {
          return state.error[field]?.[0]
      }
      return null
  }

  const getGlobalError = () => {
      if (state?.error && typeof state.error === 'string') {
          return state.error
      }
      return null
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }

    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be less than 2MB")
      return
    }

    setIsUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append("avatar", file)
      
      const result = await uploadAvatar(formData)
      if (result.error) {
        toast.error(result.error)
      } else if (result.url) {
        setAvatarUrl(result.url)
        toast.success("Avatar updated successfully")
        router.refresh()
      }
    } catch (error) {
      toast.error("Failed to upload avatar")
    } finally {
      setIsUploadingAvatar(false)
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  return (
    <form id="account-form" action={formAction} className="space-y-6">
      {/* Profile Information Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-medium">Profile Information</h3>
          <p className="text-sm text-muted-foreground">
            Update your account's profile information and email address.
          </p>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16">
                <AvatarImage src={avatarUrl} alt={user.displayName || user.username} />
                <AvatarFallback>{(user.displayName || user.username || "U").slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={isUploadingAvatar}
                className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isUploadingAvatar ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              {/* Hidden field to submit avatar URL */}
              <input type="hidden" name="avatar" value={avatarUrl} />
            </div>
            <div className="grid gap-1 flex-1">
              <Label>Avatar</Label>
              <p className="text-sm text-muted-foreground">
                Click the camera icon to upload a new avatar. Max size: 2MB.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="username">Username</Label>
            <Input 
              id="username" 
              defaultValue={user.username || ""} 
              disabled
              className="bg-muted"
            />
            <p className="text-sm text-muted-foreground">
              Your unique username cannot be changed.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input 
              id="displayName" 
              name="displayName" 
              defaultValue={user.displayName || user.username || ""} 
              placeholder="Leave empty to use username"
            />
            <p className="text-sm text-muted-foreground">
              This name will be shown in the sidebar. If empty, your username will be used.
            </p>
            {getErrorMessage('displayName') && (
              <p className="text-sm text-destructive">{getErrorMessage('displayName')}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={user.email} required />
            <p className="text-sm text-muted-foreground">
              Changing your email requires verification. A link will be sent to the new address.
            </p>
            {getErrorMessage('email') && (
              <p className="text-sm text-destructive">{getErrorMessage('email')}</p>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Change Password Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-medium">Change Password</h3>
          <p className="text-sm text-muted-foreground">
            Ensure your account is using a long, random password to stay secure.
          </p>
        </div>
        
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input id="currentPassword" name="currentPassword" type="password" />
            {getErrorMessage('currentPassword') && (
              <p className="text-sm text-destructive">{getErrorMessage('currentPassword')}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input id="newPassword" name="newPassword" type="password" />
            {getErrorMessage('newPassword') && (
              <p className="text-sm text-destructive">{getErrorMessage('newPassword')}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" />
            {getErrorMessage('confirmPassword') && (
              <p className="text-sm text-destructive">{getErrorMessage('confirmPassword')}</p>
            )}
          </div>
        </div>
      </div>
      
      {state?.success && (
        <Alert className="bg-green-50 text-green-900 border-green-200">
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      )}
      {getGlobalError() && (
        <Alert variant="destructive">
          <AlertDescription>{getGlobalError()}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}
