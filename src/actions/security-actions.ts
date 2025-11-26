'use server';

import { authenticator } from 'otplib';
import { supabaseAdmin } from '@/lib/supabase';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

export async function generateTwoFactorSecret() {
  const session = await auth();
  if (!session?.user) return { error: 'Not authenticated' };

  if (!supabaseAdmin) return { error: 'Server configuration error' };

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(session.user.email || 'User', 'Echo', secret);

  return { secret, otpauth };
}

export async function enableTwoFactor(secret: string, token: string) {
  const session = await auth();
  if (!session?.user) return { error: 'Not authenticated' };

  if (!supabaseAdmin) return { error: 'Server configuration error' };

  try {
    const isValid = authenticator.check(token, secret);
    if (!isValid) return { error: 'Invalid token' };

    const { error } = await supabaseAdmin
      .from('users')
      .update({
        two_factor_secret: secret,
        two_factor_enabled: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.user.id);

    if (error) throw error;

    revalidatePath('/settings');
    return { success: true };
  } catch (error: any) {
    return { error: error.message || 'Failed to enable 2FA' };
  }
}

export async function disableTwoFactor() {
  const session = await auth();
  if (!session?.user) return { error: 'Not authenticated' };

  if (!supabaseAdmin) return { error: 'Server configuration error' };

  try {
    const { error } = await supabaseAdmin
      .from('users')
      .update({
        two_factor_enabled: false,
        two_factor_secret: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.user.id);

    if (error) throw error;

    revalidatePath('/settings');
    return { success: true };
  } catch (error: any) {
    return { error: error.message || 'Failed to disable 2FA' };
  }
}

