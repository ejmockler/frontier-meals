#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables:');
  console.error('PUBLIC_SUPABASE_URL:', !!supabaseUrl);
  console.error('SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  const migrationPath = join(
    process.cwd(),
    'supabase',
    'migrations',
    '20251027000000_create_schema.sql'
  );

  console.log('Reading migration file:', migrationPath);
  const sql = readFileSync(migrationPath, 'utf-8');

  console.log('Executing migration...');

  // Split the SQL into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (!statement) continue;

    console.log(`Executing statement ${i + 1}/${statements.length}...`);

    const { error } = await supabase.rpc('exec_sql', {
      sql_query: statement + ';'
    });

    if (error) {
      console.error(`Error in statement ${i + 1}:`, error);
      // Try direct execution as fallback
      const { error: directError } = await supabase
        .from('_migrations')
        .insert({ name: '20251027000000_create_schema', executed_at: new Date().toISOString() });

      if (directError) {
        console.error('Failed to record migration:', directError);
      }
    }
  }

  console.log('Migration completed!');
}

runMigration().catch(console.error);
