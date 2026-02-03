'use server';

import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { getAdminClient } from '@/lib/appwrite';
import { DATABASE_ID } from '@/lib/appwrite_client';
import { ID, Query } from 'node-appwrite';
import { sendVerificationEmail, sendPasswordResetEmail } from '@/lib/email';

const RegisterSchema = z.object({
  username: z.string().min(2, 'Username must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function registerUser(prevState: string | undefined, formData: FormData) {
  try {
    const validatedFields = RegisterSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
      return 'Invalid fields';
    }

    const { email, password, username: requestedUsername } = validatedFields.data;

    const { databases, users } = await getAdminClient();

    // Check if email exists in Appwrite Auth
    try {
        const { users: existingAuthUsers } = await users.list([Query.equal('email', email)]);
        if (existingAuthUsers.length > 0) {
            return 'Email already in use';
        }
    } catch (e) {
        // Ignore
    }

    // Check if username is available in DB
    let username = requestedUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
    let usernameExists = true;
    let attempts = 0;
    
    while (usernameExists && attempts < 10) {
      const { documents: existingUsernames } = await databases.listDocuments(
        DATABASE_ID,
        'users',
        [Query.equal('username', username)]
      );
      
      if (existingUsernames.length === 0) {
        usernameExists = false;
      } else {
        username = `${requestedUsername}${crypto.randomInt(1000, 9999)}`;
        attempts++;
      }
    }

    const userId = ID.unique();

    // Create Appwrite User
    try {
        await users.create(
            userId,
            email,
            undefined, // Phone
            password,
            username // Name
        );
    } catch (createError: any) {
        console.error('Error creating Appwrite user:', createError);
        if (createError.code === 409) return 'Email already in use';
        return 'Failed to create user account';
    }

    // Create DB User Profile
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    try {
        await databases.createDocument(
            DATABASE_ID,
            'users',
            userId,
            {
                username,
                email,
                password: hashedPassword,
                verification_token: verificationToken,
                email_verified: false
            }
        );
    } catch (createError: any) {
        console.error('Error creating user profile:', createError);
        await users.delete(userId);
        return 'Failed to create user profile';
    }

    // Send verification email
    const emailResult = await sendVerificationEmail(email, username, verificationToken);
    
    if (!emailResult.success) {
      console.error('[Register] Failed to send verification email:', emailResult.error);
    }

    return 'verification-needed';
    
  } catch (error) {
    console.error('Registration error:', error);
    return 'Something went wrong';
  }
}

export async function resendVerificationEmail(email: string) {
  try {
    const { databases } = await getAdminClient();
    
    const { documents } = await databases.listDocuments(
        DATABASE_ID,
        'users',
        [Query.equal('email', email)]
    );
    const user = documents[0];
    
    if (!user) {
      return { error: 'User not found.' };
    }
    
    if (user.email_verified) {
      return { error: 'Email is already verified.' };
    }
    
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    try {
        await databases.updateDocument(
            DATABASE_ID,
            'users',
            user.$id,
            { verification_token: verificationToken }
        );
    } catch (updateError) {
      console.error('[Resend] Failed to update verification token:', updateError);
      return { error: 'Failed to generate new verification token.' };
    }
    
    const emailResult = await sendVerificationEmail(user.email, user.display_name || user.username, verificationToken);
    
    if (!emailResult.success) {
      return { error: 'Failed to send verification email. Please try again later.' };
    }
    
    return { success: true };
  } catch (error) {
    console.error('[Resend] Error:', error);
    return { error: 'Something went wrong.' };
  }
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  return 'Please use client-side authentication';
}

export async function requestPasswordReset(email: string) {
  try {
    const { databases } = await getAdminClient();
    
    const { documents } = await databases.listDocuments(
        DATABASE_ID,
        'users',
        [Query.equal('email', email)]
    );
    const user = documents[0];
    
    if (!user) {
      return { success: true };
    }
    
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000).toISOString();
    
    try {
        await databases.updateDocument(
            DATABASE_ID,
            'users',
            user.$id,
            { 
                reset_token: resetToken,
                reset_token_expiry: resetTokenExpiry
            }
        );
    } catch (updateError) {
      console.error('[Password Reset] Failed to update reset token:', updateError);
      return { error: 'Failed to process request. Please try again.' };
    }
    
    const emailResult = await sendPasswordResetEmail(user.email, user.display_name || user.username, resetToken);
    
    if (!emailResult.success) {
      console.error('[Password Reset] Failed to send reset email:', emailResult.error);
    }
    
    return { success: true };
  } catch (error) {
    console.error('[Password Reset] Error:', error);
    return { error: 'Something went wrong.' };
  }
}

export async function resetPassword(token: string, newPassword: string) {
  try {
    if (!token || newPassword.length < 6) {
      return { error: 'Invalid request.' };
    }
    
    const { databases, users } = await getAdminClient();
    
    const { documents } = await databases.listDocuments(
        DATABASE_ID,
        'users',
        [Query.equal('reset_token', token)]
    );
    const user = documents[0];
    
    if (!user) {
      return { error: 'Invalid or expired reset link.' };
    }
    
    if (user.reset_token_expiry && new Date(user.reset_token_expiry) < new Date()) {
      return { error: 'Reset link has expired. Please request a new one.' };
    }
    
    // Update Appwrite Auth Password
    try {
        await users.updatePassword(user.$id, newPassword);
    } catch (e) {
        console.error('Failed to update Appwrite password:', e);
        return { error: 'Failed to reset password.' };
    }
    
    // Clear reset token
    try {
        await databases.updateDocument(
            DATABASE_ID,
            'users',
            user.$id,
            { 
                reset_token: null,
                reset_token_expiry: null
            }
        );
    } catch (updateError) {
      console.error('[Password Reset] Failed to clear reset token:', updateError);
    }
    
    return { success: true };
  } catch (error) {
    console.error('[Password Reset] Error:', error);
    return { error: 'Something went wrong.' };
  }
}
