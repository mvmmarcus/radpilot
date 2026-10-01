import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exportReportAsFhir } from "@/modules/interop/server";

/**
 * GET /api/fhir/DiagnosticReport/[reportId] -> application/fhir+json
 *
 * Only reports with status "final" or "amended" are exportable. Every
 * successful export records a report.exported audit event (table audit_events,
 * RLS requires actor_id = auth.uid(), so this route needs a signed-in user).
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/fhir/DiagnosticReport/[reportId]">) {
  const { reportId } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "login", diagnostics: "Sign in required." }] },
      { status: 401 },
    );
  }

  let result;
  try {
    result = await exportReportAsFhir(supabase, reportId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "exception", diagnostics: message }] },
      { status: 500 },
    );
  }

  if (!result.ok) {
    const diagnostics =
      result.reason === "not_found"
        ? `No report with id ${reportId}.`
        : `Report ${reportId} has status "${result.status}"; only final or amended reports can be exported.`;
    return NextResponse.json(
      { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "not-found", diagnostics }] },
      { status: 404 },
    );
  }

  const { error: auditError } = await supabase.from("audit_events").insert({
    actor_id: user.id,
    entity: "report",
    entity_id: reportId,
    action: "report.exported",
    payload: { format: "fhir+json" },
  });
  if (auditError) {
    // The export already succeeded; do not fail the response over a logging
    // error, but surface it so it is not silently swallowed.
    console.error(`report.exported audit event failed for ${reportId}:`, auditError.message);
  }

  return NextResponse.json(result.bundle, {
    status: 200,
    headers: { "Content-Type": "application/fhir+json" },
  });
}
