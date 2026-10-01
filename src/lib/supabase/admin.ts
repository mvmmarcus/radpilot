import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Service-role client. BYPASSES RLS.
 * Only for scripts and trusted server-side jobs, never for request handling on
 * behalf of a user. Never import this from client code.
 */
export function createAdminClient() {
  const env = getServerEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (see .env.example).");
  }
  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
