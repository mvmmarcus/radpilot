import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  checkAiQuota,
  generateReportDraft,
  getLLMProvider,
  SupabaseGenerationLogRepository,
} from "@/modules/ai/server";
import { GENERATION_ID_HEADER } from "@/modules/reports/server";
import { BodyPartSchema, ModalitySchema, PatientSexSchema } from "@/modules/studies";
import { SectionKeySchema } from "@/modules/templates";

export const runtime = "nodejs";

const RequestSchema = z.object({
  reportId: z.uuid().nullable(),
  sections: z
    .array(z.object({ key: SectionKeySchema, label: z.string().min(1), required: z.boolean() }))
    .min(1),
  exam: z.object({
    modality: ModalitySchema,
    bodyPart: BodyPartSchema,
    indication: z.string(),
    patientSex: PatientSexSchema,
    patientAgeYears: z.number().int().nonnegative(),
  }),
  shorthand: z.string(),
});

/**
 * POST /api/generate: streams a GeneratedReport (see ai/domain/generation.ts)
 * section by section, as chunked JSON text, for @ai-sdk/react's useObject on
 * the client (src/modules/reports/ui/report-editor.tsx).
 *
 * Every call is logged to ai_generations before the stream starts (outcome
 * "pending") and completed with latency/tokens once the model finishes.
 * Never logs the prompt or shorthand with `logger` (PHI policy): they live
 * only in the ai_generations.input column, which RLS restricts to signed-in
 * users.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: z.prettifyError(parsed.error) }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const input = parsed.data;

  const provider = getLLMProvider();
  const log = new SupabaseGenerationLogRepository(supabase);

  if (provider.name !== "mock") {
    const quota = await checkAiQuota(log, user.id);
    if (!quota.ok) {
      return new Response(quota.message, { status: 429 });
    }
  }

  const generation = generateReportDraft(provider, log, {
    reportId: input.reportId,
    createdBy: user.id,
    promptInput: { sections: input.sections, exam: input.exam, shorthand: input.shorthand },
  });

  // Settle the ai_generations row once the stream is fully consumed, without
  // blocking the response. Errors here are a logging concern, not a request
  // failure, so they are only logged with ids (no prompt/shorthand text).
  generation.settle().catch((err) => {
    logger.error("ai_generations settle failed", {
      generationId: generation.generationId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  const stream = toByteStream(generation.textStream);
  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      [GENERATION_ID_HEADER]: generation.generationId,
    },
  });
}

/** Encodes a text-delta stream (growing JSON text) as the bytes useObject expects. */
function toByteStream(textDeltas: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of textDeltas) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        logger.error("generate stream failed", { error: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
}
