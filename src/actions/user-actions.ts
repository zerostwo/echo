"use server"

import { auth } from "@/auth"
import { supabase, supabaseAdmin } from "@/lib/supabase"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import bcrypt from "bcrypt"
import { randomUUID } from "crypto"
import { sendEmailChangeVerification } from "@/lib/email"

const updateUserSchema = z.object({
  displayName: z.string().optional(),
  email: z.string().email("Invalid email address"),
  avatar: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
}).refine((data) => {
  if (data.newPassword && data.newPassword.length > 0 && data.newPassword.length < 8) {
      return false
  }
  return true
}, {
    message: "Password must be at least 8 characters",
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
    displayName: formData.get("displayName") || undefined,
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

  const { displayName, email, avatar, currentPassword, newPassword } = validatedFields.data

  try {
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single()

    if (fetchError || !user) {
      console.error("User fetch error:", fetchError);
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

    // Handle email change with verification
    let emailChangeMessage = ""
    if (email !== user.email) {
      // Check if email is already taken by another user
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single()

      if (existingUser) {
        return { error: { email: ["Email is already in use"] } }
      }

      // Generate verification token for email change
      const verificationToken = randomUUID()
      
      // Store pending email and token
      const { error: tokenError } = await supabase
        .from('users')
        .update({ 
          verification_token: verificationToken,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.user.id)

      if (tokenError) {
        throw tokenError
      }

      // Send verification email to new address
      await sendEmailChangeVerification(
        email, 
        user.display_name || user.username || "User",
        verificationToken,
        email // Store the new email in the link
      )

      emailChangeMessage = " A verification email has been sent to your new email address."
    }

    const updates: any = {
      display_name: displayName || null,
      image: avatar,
      updated_at: new Date().toISOString(),
    }
    
    if (hashedPassword) {
      updates.password = hashedPassword
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', session.user.id)

    if (updateError) {
      throw updateError
    }

    revalidatePath("/", "layout")
    return { success: "Profile updated successfully." + emailChangeMessage }
  } catch (error) {
    console.error("Failed to update user:", error)
    return { error: "Failed to update profile" }
  }
}

export async function uploadAvatar(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  const file = formData.get("avatar") as File
  if (!file || file.size === 0) {
    return { error: "No file provided" }
  }

  // Validate file type
  if (!file.type.startsWith("image/")) {
    return { error: "File must be an image" }
  }

  // Limit file size (2MB)
  if (file.size > 2 * 1024 * 1024) {
    return { error: "File size must be less than 2MB" }
  }

  try {
    const client = supabaseAdmin || supabase
    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split(".").pop() || "png"
    const filename = `${session.user.id}/avatar-${Date.now()}.${ext}`
    
    // Upload to avatars bucket
    const BUCKET_NAME = "avatars"
    
    let { error: uploadError } = await client.storage
      .from(BUCKET_NAME)
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: true
      })

    // If bucket doesn't exist, create it
    if (uploadError && (uploadError.message.includes("Bucket not found") || (uploadError as any).statusCode === "404")) {
      const { error: createError } = await client.storage.createBucket(BUCKET_NAME, {
        public: true,
        allowedMimeTypes: ["image/*"],
        fileSizeLimit: 2097152 // 2MB
      })

      if (!createError) {
        const retryResult = await client.storage
          .from(BUCKET_NAME)
          .upload(filename, buffer, {
            contentType: file.type,
            upsert: true
          })
        uploadError = retryResult.error
      }
    }

    if (uploadError) {
      console.error("Avatar upload error:", uploadError)
      return { error: "Failed to upload avatar" }
    }

    // Get public URL
    const { data: { publicUrl } } = client.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filename)

    // Ensure we use the configured public URL from env if available, 
    // to avoid internal docker/localhost URLs if running in a container
    let finalUrl = publicUrl;
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const relativePath = publicUrl.split('/storage/v1/object/public/')[1];
      if (relativePath) {
        // Remove trailing slash from base if present
        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
        finalUrl = `${baseUrl}/storage/v1/object/public/${relativePath}`;
      }
    }

    // Update user record
    const { error: updateError } = await client
      .from("users")
      .update({ 
        image: finalUrl,
        updated_at: new Date().toISOString()
      })
      .eq("id", session.user.id)

    if (updateError) {
      throw updateError
    }

    revalidatePath("/", "layout")
    return { success: true, url: finalUrl }
  } catch (error) {
    console.error("Avatar upload error:", error)
    return { error: "Failed to upload avatar" }
  }
}

export async function updateSettings(settings: any) {
  const session = await auth();
  if (!session?.user?.id) {
      return { error: 'Unauthorized' };
  }

  try {
      const client = supabaseAdmin || supabase;
      const { data: user } = await client.from('users').select('settings').eq('id', session.user.id).single();
      
      let currentSettings = {};
      if (user?.settings) {
          try {
              currentSettings = JSON.parse(user.settings);
          } catch (e) {}
      }
      
      const newSettings = { ...currentSettings, ...settings };

      const { error: updateError } = await client
          .from('users')
          .update({ 
            settings: JSON.stringify(newSettings),
            updated_at: new Date().toISOString() 
          })
          .eq('id', session.user.id);

      if (updateError) {
        throw updateError;
      }

      revalidatePath('/', 'layout');
      return { success: true };
  } catch (error) {
      console.error("Failed to update settings:", error);
      return { error: 'Failed to update settings' };
  }
}

