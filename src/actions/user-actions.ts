"use server"

import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import bcrypt from "bcryptjs"

const updateUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  avatar: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
}).refine((data) => {
  if (data.newPassword && data.newPassword.length > 0 && data.newPassword.length < 6) {
      return false
  }
  return true
}, {
    message: "Password must be at least 6 characters",
    path: ["newPassword"]
}).refine((data) => {
  if (data.newPassword && data.newPassword !== data.confirmPassword) {
    return false
  }
  return true
}, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
})

export async function updateUser(prevState: any, formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  const rawData = {
    name: formData.get("name"),
    email: formData.get("email"),
    avatar: formData.get("avatar"),
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  }

  const validatedFields = updateUserSchema.safeParse(rawData)

  if (!validatedFields.success) {
      // Format Zod errors
      const errors: Record<string, string[]> = {}
      validatedFields.error.issues.forEach(issue => {
          const path = issue.path[0] as string
          if (!errors[path]) errors[path] = []
          errors[path].push(issue.message)
      })
    return { error: errors } // Return structured errors
  }

  const { name, email, avatar, currentPassword, newPassword } = validatedFields.data

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (!user) {
      return { error: "User not found" }
    }

    // If updating password, verify current password
    let hashedPassword = undefined
    if (newPassword && newPassword.length > 0) {
      if (!currentPassword) {
        return { error: { currentPassword: ["Current password is required to set a new password"] } }
      }

      const passwordsMatch = await bcrypt.compare(currentPassword, user.password)
      if (!passwordsMatch) {
        return { error: { currentPassword: ["Incorrect current password"] } }
      }

      hashedPassword = await bcrypt.hash(newPassword, 10)
    }

    // Check if email is already taken by another user
    if (email !== user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      })
      if (existingUser) {
        return { error: { email: ["Email is already in use"] } }
      }
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name,
        email,
        image: avatar,
        ...(hashedPassword && { password: hashedPassword }),
      },
    })

    revalidatePath("/account")
    return { success: "Profile updated successfully" }
  } catch (error) {
    console.error("Failed to update user:", error)
    return { error: "Failed to update profile" }
  }
}

export async function updateSettings(settings: any) {
  const session = await auth();
  if (!session?.user?.id) {
      return { error: 'Unauthorized' };
  }

  try {
      // Fetch current settings to merge? Or just overwrite?
      // The settings field is a stringified JSON
      
      await prisma.user.update({
          where: { id: session.user.id },
          data: {
              settings: JSON.stringify(settings)
          }
      });

      revalidatePath('/settings');
      return { success: true };
  } catch (error) {
      console.error("Failed to update settings:", error);
      return { error: 'Failed to update settings' };
  }
}
