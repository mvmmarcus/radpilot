"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { claimStudy, releaseStudy, SupabaseStudyRepository } from "@/modules/studies/server";

export interface WorklistActionState {
  error?: string;
}

/**
 * Claim an unassigned study as the signed-in user. RLS (`studies: claim or
 * release, admins reassign`) enforces this server-side too, so a failure here
 * just means someone else got to it first.
 */
export async function claimStudyAction(
  _prevState: WorklistActionState,
  formData: FormData,
): Promise<WorklistActionState> {
  const studyId = formData.get("studyId");
  if (typeof studyId !== "string" || !studyId) {
    return { error: "Missing study id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to claim a study." };

  const result = await claimStudy(new SupabaseStudyRepository(supabase), studyId, user.id);
  if (!result.ok) {
    return { error: "That study was already claimed by someone else." };
  }

  revalidatePath("/worklist");
  return {};
}

/** Release a study the signed-in user currently holds. */
export async function releaseStudyAction(
  _prevState: WorklistActionState,
  formData: FormData,
): Promise<WorklistActionState> {
  const studyId = formData.get("studyId");
  if (typeof studyId !== "string" || !studyId) {
    return { error: "Missing study id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to release a study." };

  const result = await releaseStudy(new SupabaseStudyRepository(supabase), studyId, user.id);
  if (!result.ok) {
    return { error: "You can only release studies assigned to you." };
  }

  revalidatePath("/worklist");
  return {};
}
