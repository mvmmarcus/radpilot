import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { ageInYears, ageSexLabel } from "@/modules/studies";
import { toStudy, toPatient, WORKLIST_SELECT, type WorklistRow } from "@/modules/studies/server";
import { getTemplateForStudy, SupabaseTemplateRepository } from "@/modules/templates/server";
import { createReport, SupabaseReportRepository } from "@/modules/reports/server";
import { loadSeriesForViewer } from "@/modules/viewer/server";
import { ReadingRoom } from "./reading-room";

/**
 * The reading room: viewer (left) + report editor (middle) + copilot panel
 * (right). A Server Component that loads everything the client shell needs
 * up front, then hands off to the client composition in reading-room.tsx
 * (autosave, debounced copilot runs, streaming generation and the lifecycle
 * actions all need client state/effects).
 */
export default async function StudyPage({ params }: PageProps<"/studies/[id]">) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: studyRow, error: studyError } = await supabase
    .from("studies")
    .select(WORKLIST_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (studyError) throw new Error(`Failed to load study ${id}: ${studyError.message}`);
  if (!studyRow || !(studyRow as WorklistRow).patient) notFound();

  const row = studyRow as WorklistRow;
  const study = toStudy(row);
  const patient = toPatient(row.patient!);

  const templateRepo = new SupabaseTemplateRepository(supabase);
  const template = await getTemplateForStudy(templateRepo, { modality: study.modality, bodyPart: study.bodyPart });
  if (!template) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">No template for this exam</h1>
        <p className="max-w-md text-muted-foreground">
          No report template matches {study.modality} / {study.bodyPart}. An admin needs to add one.
        </p>
        <Button asChild variant="outline">
          <Link href="/worklist">Back to worklist</Link>
        </Button>
      </div>
    );
  }

  const reportRepo = new SupabaseReportRepository(supabase);
  const report = await createReport(reportRepo, {
    studyId: study.id,
    template: { id: template.id, sections: template.sections },
    indication: study.indication,
    createdBy: user.id,
  });

  const seriesResult = study.dicomPath ? await loadSeriesForViewer(supabase, study.dicomPath) : null;

  return (
    <ReadingRoom
      study={study}
      patientName={patient.fullName}
      patientLabel={ageSexLabel(patient)}
      patientSex={patient.sex}
      patientAgeYears={ageInYears(patient.birthDate)}
      template={template}
      report={report}
      seriesResult={seriesResult}
    />
  );
}
