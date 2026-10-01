import type { WorklistItem } from "../domain/study";
import type { StudyRepository } from "./study-repository";

export type ReleaseStudyResult =
  | { ok: true; item: WorklistItem }
  | { ok: false; reason: "not_found_or_not_yours" };

/** Release a study you currently hold, making it unassigned again. */
export async function releaseStudy(
  repo: StudyRepository,
  studyId: string,
  userId: string,
): Promise<ReleaseStudyResult> {
  const item = await repo.release(studyId, userId);
  if (!item) return { ok: false, reason: "not_found_or_not_yours" };
  return { ok: true, item };
}
