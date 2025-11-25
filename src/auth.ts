import NextAuth, { DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authConfig } from './auth.config';

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
            return null; // Or throw an error if you want a specific message
          }

          const passwordsMatch = await bcrypt.compare(password, user.password);
          
          if (passwordsMatch) return user;
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
        }
        return session
    }
  },
});
