import { getServerEnv } from "@/lib/env";
import type { LLMProvider } from "../application/provider";
import { createAnthropicProvider } from "./anthropic-provider";
import { MockLLMProvider } from "./mock-provider";
import { createOpenAiProvider } from "./openai-provider";

let cached: LLMProvider | undefined;

/** Picks the adapter named by getServerEnv().AI_PROVIDER ("mock" by default). */
export function getLLMProvider(): LLMProvider {
  cached ??= createLLMProvider();
  return cached;
}

function createLLMProvider(): LLMProvider {
  const env = getServerEnv();
  switch (env.AI_PROVIDER) {
    case "openai":
      return createOpenAiProvider(env.OPENAI_API_KEY!, env.AI_MODEL);
    case "anthropic":
      return createAnthropicProvider(env.ANTHROPIC_API_KEY!, env.AI_MODEL);
    case "mock":
    default:
      return new MockLLMProvider();
  }
}
