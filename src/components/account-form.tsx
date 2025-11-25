"use client"

import { useActionState } from "react"
import { updateUser } from "@/actions/user-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function AccountForm({ user }: { user: any }) {
  const [state, formAction, isPending] = useActionState(updateUser, null)

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

  return (
    <form action={formAction} className="max-w-2xl mx-auto">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Update your account's profile information and email address.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                    <AvatarImage src={user.image} alt={user.name} />
                    <AvatarFallback>CN</AvatarFallback>
                </Avatar>
                <div className="grid gap-1 flex-1">
                    <Label htmlFor="avatar">Avatar URL</Label>
                    <Input
                        id="avatar"
                        name="avatar"
                        defaultValue={user.image || ""}
                        placeholder="https://example.com/avatar.png"
                    />
                </div>
             </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={user.name || ""} required />
              {getErrorMessage('name') && (
                <p className="text-sm text-destructive">{getErrorMessage('name')}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={user.email} required />
              {getErrorMessage('email') && (
                <p className="text-sm text-destructive">{getErrorMessage('email')}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>
              Ensure your account is using a long, random password to stay secure.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
        
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

        <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
            </Button>
        </div>
      </div>
    </form>
  )
}

