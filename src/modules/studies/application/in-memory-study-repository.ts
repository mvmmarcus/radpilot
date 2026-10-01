import type { WorklistItem } from "../domain/study";
import type { StudyRepository, WorklistFilters } from "./study-repository";

/**
 * In-memory `StudyRepository` for unit tests. Mirrors the RLS policy in
 * supabase/migrations/20261001000100_rls.sql: claiming only succeeds when the
 * study is unassigned or already yours; releasing only succeeds when it's yours.
 */
export class InMemoryStudyRepository implements StudyRepository {
  private items: Map<string, WorklistItem>;

  constructor(seed: WorklistItem[] = []) {
    this.items = new Map(seed.map((item) => [item.id, item]));
  }

  async listWorklist(filters?: WorklistFilters): Promise<WorklistItem[]> {
    let items = [...this.items.values()];
    if (filters?.status) items = items.filter((item) => item.status === filters.status);
    if (filters?.modality) items = items.filter((item) => item.modality === filters.modality);
    if (filters?.assignedTo) items = items.filter((item) => item.assignedTo === filters.assignedTo);
    return items;
  }

  async claim(studyId: string, userId: string): Promise<WorklistItem | null> {
    const item = this.items.get(studyId);
    if (!item) return null;
    if (item.assignedTo !== null && item.assignedTo !== userId) return null;
    const updated = { ...item, assignedTo: userId };
    this.items.set(studyId, updated);
    return updated;
  }

  async release(studyId: string, userId: string): Promise<WorklistItem | null> {
    const item = this.items.get(studyId);
    if (!item) return null;
    if (item.assignedTo !== userId) return null;
    const updated = { ...item, assignedTo: null };
    this.items.set(studyId, updated);
    return updated;
  }
}
