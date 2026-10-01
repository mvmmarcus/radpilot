import { createBrowserClient } from "@supabase/ssr";
import { getClientEnv } from "@/lib/env";
import type { Database } from "./database.types";

/** Supabase client for Client Components. Uses the user's session cookie, so RLS applies. */
export function createClient() {
  const env = getClientEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
