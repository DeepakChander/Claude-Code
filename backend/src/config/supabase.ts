import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL is not set in environment variables');
}

if (!process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_SERVICE_KEY is not set in environment variables');
}

// Create Supabase client with service role key
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export default supabase;
