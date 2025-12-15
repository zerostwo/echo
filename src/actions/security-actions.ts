'use server';

import { authenticator } from 'otplib';
import { createSessionClient } from '@/lib/appwrite';
import { DATABASE_ID } from '@/lib/appwrite_client';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

export async function generateTwoFactorSecret() {
  const session = await auth();
  if (!session?.user) return { error: 'Not authenticated' };

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(session.user.email || 'User', 'Echo', secret);

  return { secret, otpauth };
}

export async function enableTwoFactor(secret: string, token: string) {
  const session = await auth();
  if (!session?.user) return { error: 'Not authenticated' };

  try {
    const isValid = authenticator.check(token, secret);
    if (!isValid) return { error: 'Invalid token' };

    const { databases } = await createSessionClient();

    await databases.updateDocument(
      DATABASE_ID,
      'users',
      session.user.id,
      {
        two_factor_secret: secret,
        two_factor_enabled: true,
        updated_at: new Date().toISOString(),
      }
    );

    revalidatePath('/settings');
    return { success: true };
  } catch (error: any) {
    return { error: error.message || 'Failed to enable 2FA' };
  }
}

export async function disableTwoFactor() {
  const session = await auth();
  if (!session?.user) return { error: 'Not authenticated' };

  try {
    const { databases } = await createSessionClient();

    await databases.updateDocument(
      DATABASE_ID,
      'users',
      session.user.id,
      {
        two_factor_enabled: false,
        two_factor_secret: null,
        updated_at: new Date().toISOString(),
      }
    );

    revalidatePath('/settings');
    return { success: true };
  } catch (error: any) {
    return { error: error.message || 'Failed to disable 2FA' };
  }
}

