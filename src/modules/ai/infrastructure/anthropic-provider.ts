import { createAnthropic } from "@ai-sdk/anthropic";
import type { LLMProvider } from "../application/provider";
import { VercelAiLLMProvider } from "./vercel-ai-provider";

const DEFAULT_MODEL = "claude-sonnet-4-5";

export function createAnthropicProvider(apiKey: string, model = DEFAULT_MODEL): LLMProvider {
  const anthropic = createAnthropic({ apiKey });
  return new VercelAiLLMProvider("anthropic", model, anthropic(model));
}
