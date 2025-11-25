
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function checkSentences() {
    // Use a material ID seen in logs or just pick one
    const { data: materials } = await supabaseAdmin.from('Material').select('id, title').limit(1);
    
    if (!materials || materials.length === 0) {
        console.log('No materials found');
        return;
    }

    const materialId = materials[0].id;
    console.log(`Checking material: ${materials[0].title} (${materialId})`);

    const { data: sentences } = await supabaseAdmin
        .from('Sentence')
        .select('id, order, content')
        .eq('materialId', materialId)
        .order('order', { ascending: true });

    if (!sentences) {
        console.log('No sentences found');
        return;
    }

    console.log(`Found ${sentences.length} sentences.`);
    sentences.forEach(s => {
        console.log(`Order: ${s.order}, ID: ${s.id}`);
    });
}

checkSentences();
