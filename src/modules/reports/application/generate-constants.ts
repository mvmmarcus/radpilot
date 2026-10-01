/**
 * Response header the streaming generation route (src/app/api/generate) uses
 * to hand the ai_generations row id to the client, so the editor can attach
 * it to each ReportSection.ai.generationId as the stream fills sections in.
 */
export const GENERATION_ID_HEADER = "x-ai-generation-id";
