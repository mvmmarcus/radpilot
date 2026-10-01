import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { WorklistItem } from "../domain/study";
import type { StudyRepository, WorklistFilters } from "../application/study-repository";
import { toWorklistItem, WORKLIST_SELECT, type WorklistRow } from "./mappers";

/**
 * Supabase implementation of `StudyRepository`. Runs as the signed-in user
 * (RLS applies); claiming/releasing relies on the
 * "studies: claim or release, admins reassign" policy, so an update that
 * matches zero rows (someone else already claimed it) is reported as `null`,
 * not thrown.
 */
export class SupabaseStudyRepository implements StudyRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async listWorklist(filters?: WorklistFilters): Promise<WorklistItem[]> {
    let query = this.supabase.from("studies").select(WORKLIST_SELECT);

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.modality) query = query.eq("modality", filters.modality);
    if (filters?.assignedTo) query = query.eq("assigned_to", filters.assignedTo);

    const { data, error } = await query;
    if (error) throw error;
    return (data as WorklistRow[]).map(toWorklistItem);
  }

  async claim(studyId: string, userId: string): Promise<WorklistItem | null> {
    const { data, error } = await this.supabase
      .from("studies")
      .update({ assigned_to: userId })
      .eq("id", studyId)
      .is("assigned_to", null)
      .select(WORKLIST_SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toWorklistItem(data as WorklistRow);
  }

  async release(studyId: string, userId: string): Promise<WorklistItem | null> {
    const { data, error } = await this.supabase
      .from("studies")
      .update({ assigned_to: null })
      .eq("id", studyId)
      .eq("assigned_to", userId)
      .select(WORKLIST_SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toWorklistItem(data as WorklistRow);
  }
}
