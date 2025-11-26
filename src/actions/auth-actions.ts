'use server';

import { z } from 'zod';
import crypto from 'crypto';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
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

    // Use admin client if available to ensure we can query users
    const client = supabaseAdmin || supabase;
    console.log('[Register] Using admin client:', !!supabaseAdmin);

    const { data: existingUser } = await client
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return 'Email already in use';
    }

    // Check if username is available, if not generate a unique one
    let username = requestedUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
    let usernameExists = true;
    let attempts = 0;
    
    while (usernameExists && attempts < 10) {
      const { data: existingUsername } = await client
        .from('users')
        .select('id')
        .eq('username', username)
        .single();
      
      if (!existingUsername) {
        usernameExists = false;
      } else {
        // Add random suffix if username exists
        username = `${requestedUsername}${crypto.randomInt(1000, 9999)}`;
        attempts++;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const { error: createError } = await client
      .from('users')
      .insert({
        id: crypto.randomUUID(),
        username,
        email,
        password: hashedPassword,
        updated_at: new Date().toISOString(),
        verification_token: verificationToken,
        email_verified: null, 
      });

    if (createError) {
        console.error('Error creating user:', createError);
        // If RLS blocks this, we need Service Role Key
        if (createError.code === '42501') { // permission denied
             return 'Server configuration error: Missing permissions to create user.';
        }
        throw createError;
    }

    // Send verification email
    const emailResult = await sendVerificationEmail(email, username, verificationToken);
    
    if (!emailResult.success) {
      console.error('[Register] Failed to send verification email:', emailResult.error);
      // Still log the verification link for development/debugging
      const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      console.log(`[DEV] Verification Link: ${baseUrl}/verify-email?token=${verificationToken}`);
    }

    return 'verification-needed';
    
  } catch (error) {
    console.error('Registration error:', error);
    return 'Something went wrong';
  }
}

export async function resendVerificationEmail(email: string) {
  try {
    const client = supabaseAdmin || supabase;
    
    // Find user by email
    const { data: user, error } = await client
      .from('users')
      .select('id, username, display_name, email, email_verified, verification_token')
      .eq('email', email)
      .single();
    
    if (error || !user) {
      return { error: 'User not found.' };
    }
    
    if (user.email_verified) {
      return { error: 'Email is already verified.' };
    }
    
    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // Update user with new token
    const { error: updateError } = await client
      .from('users')
      .update({ verification_token: verificationToken })
      .eq('id', user.id);
    
    if (updateError) {
      console.error('[Resend] Failed to update verification token:', updateError);
      return { error: 'Failed to generate new verification token.' };
    }
    
    // Send verification email
    const emailResult = await sendVerificationEmail(user.email, user.display_name || user.username, verificationToken);
    
    if (!emailResult.success) {
      console.error('[Resend] Failed to send verification email:', emailResult.error);
      // Still log the verification link for development/debugging
      const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      console.log(`[DEV] Verification Link: ${baseUrl}/verify-email?token=${verificationToken}`);
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
  try {
    await signIn('credentials', {
      ...Object.fromEntries(formData),
      redirectTo: '/dashboard',
    });
  } catch (error) {
    if ((error as Error).message === '2FA_REQUIRED') {
        return '2FA_REQUIRED';
    }
    if ((error as Error).message === 'Invalid 2FA code') {
        return 'Invalid 2FA code';
    }
    if ((error as Error).message === 'EMAIL_NOT_VERIFIED') {
        return 'EMAIL_NOT_VERIFIED';
    }
    if (error instanceof AuthError) {
      // Some NextAuth errors wrap the original error
      if (error.cause?.err?.message === '2FA_REQUIRED') return '2FA_REQUIRED';
      if (error.cause?.err?.message === 'Invalid 2FA code') return 'Invalid 2FA code';
      if (error.cause?.err?.message === 'EMAIL_NOT_VERIFIED') return 'EMAIL_NOT_VERIFIED';

      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        case 'CallbackRouteError':
            // Handle wrapped errors
            if (error.cause?.err?.message === '2FA_REQUIRED') return '2FA_REQUIRED';
            if (error.cause?.err?.message === 'Invalid 2FA code') return 'Invalid 2FA code';
            if (error.cause?.err?.message === 'EMAIL_NOT_VERIFIED') return 'EMAIL_NOT_VERIFIED';
            return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}

// Forgot Password - Request Reset
export async function requestPasswordReset(email: string) {
  try {
    const client = supabaseAdmin || supabase;
    
    // Find user by email
    const { data: user, error } = await client
      .from('users')
      .select('id, username, display_name, email')
      .eq('email', email)
      .single();
    
    if (error || !user) {
      // Don't reveal if email exists for security
      return { success: true };
    }
    
    // Generate reset token with expiry (1 hour)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000).toISOString(); // 1 hour
    
    // Update user with reset token
    const { error: updateError } = await client
      .from('users')
      .update({ 
        reset_token: resetToken,
        reset_token_expiry: resetTokenExpiry
      })
      .eq('id', user.id);
    
    if (updateError) {
      console.error('[Password Reset] Failed to update reset token:', updateError);
      return { error: 'Failed to process request. Please try again.' };
    }
    
    // Send reset email
    const emailResult = await sendPasswordResetEmail(user.email, user.display_name || user.username, resetToken);
    
    if (!emailResult.success) {
      console.error('[Password Reset] Failed to send reset email:', emailResult.error);
      // Still log the reset link for development/debugging
      const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      console.log(`[DEV] Password Reset Link: ${baseUrl}/reset-password?token=${resetToken}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('[Password Reset] Error:', error);
    return { error: 'Something went wrong.' };
  }
}

// Reset Password with Token
export async function resetPassword(token: string, newPassword: string) {
  try {
    if (!token || newPassword.length < 6) {
      return { error: 'Invalid request.' };
    }
    
    const client = supabaseAdmin || supabase;
    
    // Find user by reset token
    const { data: user, error } = await client
      .from('users')
      .select('id, reset_token_expiry')
      .eq('reset_token', token)
      .single();
    
    if (error || !user) {
      return { error: 'Invalid or expired reset link.' };
    }
    
    // Check if token is expired
    if (user.reset_token_expiry && new Date(user.reset_token_expiry) < new Date()) {
      return { error: 'Reset link has expired. Please request a new one.' };
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password and clear reset token
    const { error: updateError } = await client
      .from('users')
      .update({ 
        password: hashedPassword,
        reset_token: null,
        reset_token_expiry: null
      })
      .eq('id', user.id);
    
    if (updateError) {
      console.error('[Password Reset] Failed to update password:', updateError);
      return { error: 'Failed to reset password. Please try again.' };
    }
    
    return { success: true };
  } catch (error) {
    console.error('[Password Reset] Error:', error);
    return { error: 'Something went wrong.' };
  }
}
