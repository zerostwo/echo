import NextAuth, { DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authConfig } from './auth.config';
import { authenticator } from 'otplib';

declare module 'next-auth' {
  interface Session {
    user: {
      role: string;
      id: string;
    } & DefaultSession['user'];
  }
  interface User {
    role: string;
    id: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;
          
          const client = supabaseAdmin || supabase;
          
          const { data: user, error } = await client
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

          if (error || !user) return null;
          
          // Check if user is active
          if (!user.is_active) {
            return null;
          }
          
          // Check if email is verified
          if (!user.email_verified) {
            throw new Error('EMAIL_NOT_VERIFIED');
          }

          const passwordsMatch = await bcrypt.compare(password, user.password);
          
          if (passwordsMatch) {
             if (user.two_factor_enabled) {
                 const code = (credentials as any).code as string | undefined;
                 if (!code) {
                     throw new Error('2FA_REQUIRED');
                 }
                 const isValid = authenticator.check(code, user.two_factor_secret);
                 if (!isValid) {
                     throw new Error('Invalid 2FA code');
                 }
             }
             return user;
          }
        }
        return null;
      },
    }),
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
        if (user) {
            token.id = user.id;
            token.role = user.role;
        }
        return token
    },
    async session({ session, token }) {
        if (session.user && token.id) {
            session.user.id = token.id as string;
            session.user.role = token.role as string;
            // Always hydrate session with the latest profile data so UI (avatar/email/username) stays fresh
            const client = supabaseAdmin || supabase;
            try {
              const { data: userData } = await client
                .from('users')
                .select('email, image, display_name, username, quota, used_space')
                .eq('id', token.id)
                .single();

              if (userData) {
                session.user.email = userData.email;
                session.user.image = userData.image || session.user.image;
                (session.user as any).displayName = userData.display_name;
                (session.user as any).username = userData.username;
                (session.user as any).quota = Number(userData.quota) || 10737418240;
                (session.user as any).usedSpace = Number(userData.used_space) || 0;
              }
            } catch (error) {
              console.error("Failed to load user profile for session:", error);
            }
        }
        return session
    }
  },
});
