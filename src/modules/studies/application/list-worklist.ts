import { compareWorklistOrder } from "../domain/study";
import type { StudyRepository, WorklistFilters } from "./study-repository";
import type { WorklistItem } from "../domain/study";

/** Lists the worklist through the given filters, sorted by `compareWorklistOrder`. */
export async function listWorklist(
  repo: StudyRepository,
  filters?: WorklistFilters,
): Promise<WorklistItem[]> {
  const items = await repo.listWorklist(filters);
  return [...items].sort(compareWorklistOrder);
}
