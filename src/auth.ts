import { NextAuthOptions, DefaultSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { getServerSession } from "next-auth/next"

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

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: "jwt"
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
        code: { label: "2FA Code", type: "text" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;
          
          const client = supabaseAdmin || supabase;
          console.log('[Auth] Using Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
          
          const { data: user, error } = await client
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

          if (error || !user) {
            console.log('[Auth] User not found or error:', email, error);
            return null;
          }
          
          console.log('[Auth] Found user:', user.email, 'Verified:', user.email_verified);

          // Check if user is active
          if (!user.is_active) {
            return null;
          }
          
          // Check if email is verified
          if (!user.email_verified) {
            console.log('[Auth] Throwing EMAIL_NOT_VERIFIED for:', user.email);
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
             return {
                 id: user.id,
                 email: user.email,
                 role: user.role,
                 image: user.image,
                 name: user.display_name || user.username
             } as any;
          }
        }
        return null;
      },
    }),
  ],
  callbacks: {
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
                .select('email, image, display_name, username, quota, used_space, role')
                .eq('id', token.id)
                .single();

              if (userData) {
                session.user.email = userData.email;
                session.user.image = userData.image || session.user.image;
                session.user.role = userData.role || session.user.role;
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
};

export const auth = () => getServerSession(authOptions);
