import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";

/**
 * GET /api/health: deployment smoke check (e.g. after a Vercel deploy).
 * Returns booleans and names only, never secrets or data.
 */
export async function GET() {
  let env;
  try {
    env = getServerEnv();
  } catch {
    return NextResponse.json({ ok: false, env: false }, { status: 500 });
  }

  let supabase = false;
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      cache: "no-store",
    });
    supabase = res.ok;
  } catch {
    supabase = false;
  }

  const aiKeyConfigured =
    env.AI_PROVIDER === "mock" ||
    (env.AI_PROVIDER === "openai" && !!env.OPENAI_API_KEY) ||
    (env.AI_PROVIDER === "anthropic" && !!env.ANTHROPIC_API_KEY);

  const ok = supabase && aiKeyConfigured;
  return NextResponse.json(
    {
      ok,
      env: true,
      supabase,
      supabaseTarget: new URL(env.NEXT_PUBLIC_SUPABASE_URL).host,
      aiProvider: env.AI_PROVIDER,
      aiModel: env.AI_MODEL ?? null,
      aiKeyConfigured,
    },
    { status: ok ? 200 : 503 },
  );
}
