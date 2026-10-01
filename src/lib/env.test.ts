import { describe, expect, it } from "vitest";
import { parseClientEnv, parseServerEnv } from "./env";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

describe("env", () => {
  it("parses a minimal client env", () => {
    expect(parseClientEnv(base)).toEqual(base);
  });

  it("rejects a missing Supabase URL with a readable message", () => {
    expect(() => parseClientEnv({ ...base, NEXT_PUBLIC_SUPABASE_URL: undefined })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it("defaults AI_PROVIDER to mock and treats empty strings as unset", () => {
    const env = parseServerEnv({ ...base, AI_PROVIDER: "", OPENAI_API_KEY: "" });
    expect(env.AI_PROVIDER).toBe("mock");
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it("requires the matching API key for a real provider", () => {
    expect(() => parseServerEnv({ ...base, AI_PROVIDER: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(parseServerEnv({ ...base, AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" }).AI_PROVIDER).toBe(
      "openai",
    );
  });

  it("rejects an unknown provider", () => {
    expect(() => parseServerEnv({ ...base, AI_PROVIDER: "gemini" })).toThrow(/AI_PROVIDER/);
  });
});
