"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Restores the demo studies and reports to their seeded state (admins only;
 * the database function reset_demo_data() checks the role itself). Everything
 * visitors created since the last restore is discarded.
 */
export async function resetDemoDataAction(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_demo_data");
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}
