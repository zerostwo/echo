
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase env vars. Make sure to load .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function listAndVerify() {
  console.log(`Connecting to Supabase at ${supabaseUrl}...`);

  // 1. List recent users
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, email_verified, verification_token, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  if (!users || users.length === 0) {
    console.log('No users found in the database.');
    return;
  }

  console.log(`Found ${users.length} recent users:`);
  users.forEach(u => console.log(`- ${u.email}: Created=${u.created_at}, Verified=${u.email_verified}, Token=${u.verification_token}`));


  // Verify all of them for convenience in Dev
  for (const u of users) {
      const { error: updateError } = await supabase
        .from('users')
        .update({ email_verified: new Date().toISOString(), verification_token: null })
        .eq('id', u.id);
        
      if (updateError) console.error(`Failed to verify ${u.email}:`, updateError);
      else console.log(`Verified ${u.email}`);
  }
}

listAndVerify();
