import { createClient } from "@supabase/supabase-js";

// Replace these with your Supabase project credentials from https://supabase.com/dashboard
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "YOUR_ANON_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
