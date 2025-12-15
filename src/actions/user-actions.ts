'use server';

import { auth } from '@/auth';
import { getAdminClient } from '@/lib/appwrite';
import { DATABASE_ID } from '@/lib/appwrite_client';
import { ID, Permission, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import bcrypt from 'bcrypt';

const updateUserSchema = z.object({
  displayName: z.string().optional(),
  email: z.string().email("Invalid email address"),
  avatar: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
}).refine((data) => {
  if (data.newPassword && data.newPassword.length > 0 && data.newPassword.length < 8) {
      return false;
  }
  return true;
}, {
    message: "Password must be at least 8 characters",
    path: ["newPassword"]
}).refine((data) => {
  if (data.newPassword && data.newPassword !== data.confirmPassword) {
    return false;
  }
  return true;
}, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export async function updateUser(prevState: any, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const rawData = {
    displayName: formData.get("displayName") || undefined,
    email: formData.get("email"),
    avatar: formData.get("avatar"),
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  };

  const validatedFields = updateUserSchema.safeParse(rawData);

  if (!validatedFields.success) {
      const errors: Record<string, string[]> = {};
      validatedFields.error.issues.forEach(issue => {
          const path = issue.path[0] as string;
          if (!errors[path]) errors[path] = [];
          errors[path].push(issue.message);
      });
    return { error: errors };
  }

  const { displayName, email, currentPassword, newPassword } = validatedFields.data;

  try {
    const { users, databases } = await getAdminClient();
    
    // Fetch user from DB to verify password
    const dbUser = await databases.getDocument(
        DATABASE_ID,
        'users',
        session.user.id
    );

    // 1. Update Password
    if (newPassword && newPassword.length > 0) {
        if (!currentPassword) {
            return { error: { currentPassword: ["Current password is required to set a new password"] } };
        }
        
        const passwordsMatch = await bcrypt.compare(currentPassword, dbUser.password);
        if (!passwordsMatch) {
             return { error: { currentPassword: ["Incorrect current password"] } };
        }

        try {
            await users.updatePassword(session.user.id, newPassword);
            // Also update hashed password in DB
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await databases.updateDocument(
                DATABASE_ID,
                'users',
                session.user.id,
                { password: hashedPassword }
            );
        } catch (e: any) {
            return { error: { currentPassword: [e.message || "Failed to update password"] } };
        }
    }

    // 2. Update Name
    if (displayName && displayName !== dbUser.display_name) {
        await users.updateName(session.user.id, displayName);
    }

    // 3. Update Email
    let emailChangeMessage = "";
    if (email && email !== dbUser.email) {
        if (!currentPassword) {
            return { error: { currentPassword: ["Current password is required to change email"] } };
        }
        
        const passwordsMatch = await bcrypt.compare(currentPassword, dbUser.password);
        if (!passwordsMatch) {
             return { error: { currentPassword: ["Incorrect current password"] } };
        }

        try {
            await users.updateEmail(session.user.id, email);
            emailChangeMessage = " Email updated.";
        } catch (e: any) {
            return { error: { email: [e.message || "Failed to update email"] } };
        }
    }

    // 4. Update Custom User Collection
    try {
        await databases.updateDocument(
            DATABASE_ID,
            'users',
            session.user.id,
            {
                display_name: displayName,
                email: email, // Sync email
                updated_at: new Date().toISOString()
            }
        );
    } catch (e) {
        console.error("Failed to sync user profile to DB:", e);
        // Non-fatal
    }

    revalidatePath("/", "layout");
    return { success: "Profile updated successfully." + emailChangeMessage };
  } catch (error) {
    console.error("Failed to update user:", error);
    return { error: "Failed to update profile" };
  }
}

export async function uploadAvatar(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const file = formData.get("avatar") as File;
  if (!file || file.size === 0) {
    return { error: "No file provided" };
  }

  if (!file.type.startsWith("image/")) {
    return { error: "File must be an image" };
  }

  if (file.size > 2 * 1024 * 1024) {
    return { error: "File size must be less than 2MB" };
  }

  try {
    const { storage, databases } = await getAdminClient(); // Use admin for storage to ensure permissions/bucket creation
    const BUCKET_NAME = "avatars";

    // Ensure bucket exists
    try {
        await storage.getBucket(BUCKET_NAME);
    } catch (e) {
        try {
            await storage.createBucket(BUCKET_NAME, "Avatars", [], false, true, 2097152);
        } catch (createError) {
            console.error("Failed to create avatars bucket", createError);
        }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() || "png";
    const fileId = ID.unique();
    const filename = `${session.user.id}_avatar_${Date.now()}.${ext}`; // Flatten path for Appwrite

    await storage.createFile(
        BUCKET_NAME,
        fileId,
        InputFile.fromBuffer(buffer, filename),
        [Permission.read(Role.any())] // Public avatar
    );

    // Get View URL
    // Appwrite View URL format: endpoint/storage/buckets/bucketId/files/fileId/view?project=projectId
    // We can construct it or use getFileView (which returns the URL string in some SDKs, but in Node it returns buffer)
    // Actually, we should construct the URL manually or use a helper.
    // The client SDK has getFileView, Node SDK returns buffer.
    // We need the public URL.
    
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
    const avatarUrl = `${endpoint}/storage/buckets/${BUCKET_NAME}/files/${fileId}/view?project=${projectId}`;

    // Update user record
    await databases.updateDocument(
        DATABASE_ID,
        'users',
        session.user.id,
        { 
            image: avatarUrl,
            updated_at: new Date().toISOString()
        }
    );

    revalidatePath("/", "layout");
    return { success: true, url: avatarUrl };
  } catch (error) {
    console.error("Avatar upload error:", error);
    return { error: "Failed to upload avatar" };
  }
}

export async function updateSettings(settings: any) {
  const session = await auth();
  if (!session?.user?.id) {
      return { error: 'Unauthorized' };
  }

  try {
      const { databases } = await getAdminClient();
      
      const user = await databases.getDocument(
          DATABASE_ID,
          'users',
          session.user.id
      );
      
      let currentSettings = {};
      if (user?.settings) {
          try {
              currentSettings = JSON.parse(user.settings);
          } catch (e) {}
      }
      
      const newSettings = { ...currentSettings, ...settings };

      await databases.updateDocument(
          DATABASE_ID,
          'users',
          session.user.id,
          { 
            settings: JSON.stringify(newSettings),
            updated_at: new Date().toISOString() 
          }
      );

      revalidatePath('/', 'layout');
      return { success: true };
  } catch (error) {
      console.error("Failed to update settings:", error);
      return { error: 'Failed to update settings' };
  }
}

