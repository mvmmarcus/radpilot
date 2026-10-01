import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Supabase client for Server Components, Server Functions and Route Handlers.
 * Acts as the signed-in user, so RLS applies. Create one per request.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = getServerEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The session is refreshed in src/proxy.ts instead (added with auth).
          }
        },
      },
    },
  );
}
