import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildReportPdf } from "@/modules/interop/server";

/**
 * GET /api/reports/[id]/pdf -> application/pdf
 *
 * Any signed-in user may render the PDF for any report status (useful as a
 * preview while drafting), matching the existing read RLS policy on reports.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/reports/[id]/pdf">) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let result;
  try {
    result = await buildReportPdf(supabase, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: `No report with id ${id}.` }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${result.fileName}"`,
    },
  });
}
