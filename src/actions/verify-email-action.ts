'use server';

import { supabaseAdmin, supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';

export async function verifyEmail(token: string, newEmail?: string, type?: string) {
  const client = supabaseAdmin || supabase;

  const { data: user, error } = await client
    .from('users')
    .select('id, email')
    .eq('verification_token', token)
    .single();

  if (error || !user) {
    return { error: 'Invalid or expired verification token.' };
  }

  // Handle email change verification
  if (type === 'change' && newEmail) {
    // Check if new email is still available
    const { data: existingUser } = await client
      .from('users')
      .select('id')
      .eq('email', newEmail)
      .neq('id', user.id)
      .single();

    if (existingUser) {
      return { error: 'This email is already in use by another account.' };
    }

    const { error: updateError } = await client
      .from('users')
      .update({
        email: newEmail,
        verification_token: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      return { error: 'Failed to update email.' };
    }

    return { success: true, message: 'Email updated successfully!' };
  }

  // Regular email verification (registration)
  const { error: updateError } = await client
    .from('users')
    .update({
      email_verified: new Date().toISOString(),
      verification_token: null,
      is_active: true
    })
    .eq('id', user.id);

  if (updateError) {
    return { error: 'Failed to verify email.' };
  }

  return { success: true };
}

