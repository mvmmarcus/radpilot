import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listWorklist, SupabaseStudyRepository, type WorklistFilters } from "@/modules/studies/server";
import { MODALITIES, STUDY_STATUSES, type Modality, type StudyStatus } from "@/modules/studies";
import { WorklistFiltersBar } from "./worklist-filters";
import { WorklistTable } from "./worklist-table";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WorklistPage({ searchParams }: PageProps<"/worklist">) {
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const statusParam = firstParam(params.status);
  const modalityParam = firstParam(params.modality);
  const assignedToMe = firstParam(params.assignedToMe) === "1";

  const status = STUDY_STATUSES.find((value) => value === statusParam) as StudyStatus | undefined;
  const modality = MODALITIES.find((value) => value === modalityParam) as Modality | undefined;

  const filters: WorklistFilters = {
    ...(status ? { status } : {}),
    ...(modality ? { modality } : {}),
    ...(assignedToMe ? { assignedTo: user.id } : {}),
  };

  const repo = new SupabaseStudyRepository(supabase);
  const items = await listWorklist(repo, filters);

  const assigneeIds = [...new Set(items.map((item) => item.assignedTo).filter((id) => id !== null))];
  const assignees = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", assigneeIds);
    for (const profile of profiles ?? []) {
      assignees.set(profile.id, profile.full_name || "Unnamed");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <WorklistFiltersBar />
      <div className="flex-1 overflow-auto">
        <WorklistTable items={items} currentUserId={user.id} assignees={assignees} />
      </div>
    </div>
  );
}
