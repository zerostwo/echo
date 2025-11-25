'use server';

import { z } from 'zod';
import crypto from 'crypto';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

const RegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export async function registerUser(prevState: string | undefined, formData: FormData) {
  try {
    const validatedFields = RegisterSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
      return 'Invalid fields';
    }

    const { email, password, name } = validatedFields.data;

    // Use admin client if available to ensure we can query users
    const client = supabaseAdmin || supabase;

    const { data: existingUser } = await client
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return 'Email already in use';
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { error: createError } = await client
      .from('users')
      .insert({
        id: crypto.randomUUID(),
        name,
        email,
        password: hashedPassword,
        updated_at: new Date().toISOString(),
      });

    if (createError) {
        console.error('Error creating user:', createError);
        // If RLS blocks this, we need Service Role Key
        if (createError.code === '42501') { // permission denied
             return 'Server configuration error: Missing permissions to create user.';
        }
        throw createError;
    }

    // Optionally sign in immediately or redirect to login
    // For simplicity, we'll return success and let client redirect
    return 'success';
    
  } catch (error) {
    console.error('Registration error:', error);
    return 'Something went wrong';
  }
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}
