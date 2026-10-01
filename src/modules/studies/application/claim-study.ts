import type { WorklistItem } from "../domain/study";
import type { StudyRepository } from "./study-repository";

export type ClaimStudyResult =
  | { ok: true; item: WorklistItem }
  | { ok: false; reason: "not_found_or_already_claimed" };

/**
 * Claim an unassigned study for `userId`. RLS (see `studies: claim or release,
 * admins reassign` in supabase/migrations/20261001000100_rls.sql) only allows
 * the update when the study is unassigned, already yours, or you're an admin,
 * so a `null` result here means someone else claimed it first (or it doesn't
 * exist) — not a server error.
 */
export async function claimStudy(repo: StudyRepository, studyId: string, userId: string): Promise<ClaimStudyResult> {
  const item = await repo.claim(studyId, userId);
  if (!item) return { ok: false, reason: "not_found_or_already_claimed" };
  return { ok: true, item };
}
