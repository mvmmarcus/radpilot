import type { WorklistItem } from "../domain/study";

/** Filters accepted by `StudyRepository.listWorklist`, mirroring the worklist URL search params. */
export interface WorklistFilters {
  status?: WorklistItem["status"];
  modality?: WorklistItem["modality"];
  /** When set, only studies assigned to this profile id. */
  assignedTo?: string;
}

/**
 * Port the worklist application use cases depend on. `src/modules/studies/infrastructure`
 * has the Supabase implementation; tests use an in-memory one
 * (see `./in-memory-study-repository.ts`).
 */
export interface StudyRepository {
  listWorklist(filters?: WorklistFilters): Promise<WorklistItem[]>;
  /**
   * Claim an unassigned study for `userId`. Returns the updated item, or `null`
   * if the study does not exist or is already assigned to someone else (RLS/
   * the in-memory repo both enforce this; the caller should show a friendly
   * "already claimed" message rather than treat this as an unexpected error).
   */
  claim(studyId: string, userId: string): Promise<WorklistItem | null>;
  /**
   * Release a study you currently hold. Returns the updated item, or `null`
   * if the study does not exist or is assigned to someone else.
   */
  release(studyId: string, userId: string): Promise<WorklistItem | null>;
}
