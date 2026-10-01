import { createOpenAI } from "@ai-sdk/openai";
import type { LLMProvider } from "../application/provider";
import { VercelAiLLMProvider } from "./vercel-ai-provider";

const DEFAULT_MODEL = "gpt-4.1-mini";

export function createOpenAiProvider(apiKey: string, model = DEFAULT_MODEL): LLMProvider {
  const openai = createOpenAI({ apiKey });
  return new VercelAiLLMProvider("openai", model, openai(model));
}
