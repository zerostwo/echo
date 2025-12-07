import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Client for public usage (obeys RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Client for server-side admin usage (bypasses RLS)
// Use this in Server Actions when you need full access
export const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

if (typeof window === 'undefined') {
  if (!supabaseAdmin) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY is missing. Server-side operations may fail if RLS is enabled.');
  }
}
