import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Anon (public) client for MCP tools. RLS applies as `anon`.
// Never reference SUPABASE_SERVICE_ROLE_KEY here — this endpoint is unauthenticated.
export function getPublicSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars are not configured.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
