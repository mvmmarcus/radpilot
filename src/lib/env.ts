import { z } from "zod";

/**
 * Typed, validated environment.
 *
 * - Client vars (NEXT_PUBLIC_*) are read with literal `process.env.X` access so
 *   Next.js can inline them into the browser bundle.
 * - Server vars are validated lazily on first use, so `next build` does not
 *   need secrets, but a misconfigured server fails fast with a readable error.
 */

// `.env` files often contain `KEY=` with no value; treat that as "not set".
const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

export const AI_PROVIDERS = ["mock", "openai", "anthropic"] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export const serverEnvSchema = clientEnvSchema
  .extend({
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    AI_PROVIDER: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.enum(AI_PROVIDERS).default("mock"),
    ),
    AI_MODEL: optionalString,
    OPENAI_API_KEY: optionalString,
    ANTHROPIC_API_KEY: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENAI_API_KEY"],
        message: "is required when AI_PROVIDER=openai",
      });
    }
    if (env.AI_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["ANTHROPIC_API_KEY"],
        message: "is required when AI_PROVIDER=anthropic",
      });
    }
  });

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function parseOrThrow<T extends z.ZodType>(schema: T, source: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid ${label} environment variables (see .env.example):\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export function parseClientEnv(source: Record<string, string | undefined>): ClientEnv {
  return parseOrThrow(clientEnvSchema, source, "client");
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return parseOrThrow(serverEnvSchema, source, "server");
}

let clientEnv: ClientEnv | undefined;

export function getClientEnv(): ClientEnv {
  clientEnv ??= parseClientEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return clientEnv;
}

let serverEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() was called in the browser. Server secrets must stay on the server.");
  }
  serverEnv ??= parseServerEnv(process.env);
  return serverEnv;
}
