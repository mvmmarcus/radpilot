/**
 * npm run verify:setup [-- --env <file>] [-- --live-ai]
 *
 * Checks that an environment is wired up end to end, without printing secrets:
 *   1. env vars parse (src/lib/env.ts)
 *   2. Supabase API is reachable
 *   3. the demo user can sign in, and RLS lets them read the seeded data
 *   4. the phantom DICOM is in the private `dicom` bucket and signed URLs work
 *   5. the service role key is valid (optional)
 *   6. the OpenAI key is valid and AI_MODEL exists (free: lists models)
 *      --live-ai also makes one tiny generation through the AI SDK (~10 tokens)
 *
 * Defaults to .env.local (local Supabase). For the hosted project:
 *   npm run verify:setup -- --env .env.production.local
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseServerEnv, type ServerEnv } from "../src/lib/env";

const DEMO_EMAIL = "radiologist@radpilot.test";
const DEMO_PASSWORD = "radpilot-demo";
const EXPECTED = { studies: 10, templates: 6, finalReports: 1 };
const DICOM_SERIES = ["ct-chest-phantom", "ct-head-phantom", "cr-chest-normal", "cr-chest-pneumothorax"];

const args = process.argv.slice(2);
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.local";
const liveAi = args.includes("--live-ai");

let failures = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string, hint?: string) => {
  failures += 1;
  console.log(`  ✗ ${msg}${hint ? `\n      → ${hint}` : ""}`);
};
const skip = (msg: string) => console.log(`  - ${msg}`);
const section = (title: string) => console.log(`\n${title}`);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function checkEnv(): Promise<ServerEnv | null> {
  section(`1. Environment (${envFile})`);
  if (!existsSync(envFile)) {
    fail(`${envFile} not found`, "cp .env.example .env.local, then fill it in");
    return null;
  }
  process.loadEnvFile(envFile);
  try {
    const env = parseServerEnv(process.env);
    ok(`variables valid, AI_PROVIDER=${env.AI_PROVIDER}${env.AI_MODEL ? `, AI_MODEL=${env.AI_MODEL}` : ""}`);
    const local = /127\.0\.0\.1|localhost/.test(env.NEXT_PUBLIC_SUPABASE_URL);
    ok(`Supabase target: ${local ? "local" : "hosted"} (${new URL(env.NEXT_PUBLIC_SUPABASE_URL).host})`);
    return env;
  } catch (e) {
    fail(errText(e));
    return null;
  }
}

async function checkSupabase(env: ServerEnv) {
  section("2. Supabase API");
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ok("reachable, publishable key accepted");
  } catch (e) {
    fail(`not reachable: ${errText(e)}`, "local: is Docker running and `npm run db:start` up? hosted: check the URL");
    return;
  }

  section("3. Demo login + seeded data (as the signed-in user, RLS applies)");
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: authError } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (authError) {
    fail(`sign-in as ${DEMO_EMAIL} failed: ${authError.message}`, "run the seed: `npm run db:reset` (local) or see docs/setup.md (hosted)");
    return;
  }
  ok(`signed in as ${DEMO_EMAIL}`);

  const counts = await Promise.all([
    supabase.from("studies").select("id", { count: "exact", head: true }),
    supabase.from("templates").select("id", { count: "exact", head: true }),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "final"),
  ]);
  const labels = ["studies", "templates", "final reports"] as const;
  const expected = [EXPECTED.studies, EXPECTED.templates, EXPECTED.finalReports];
  counts.forEach(({ count, error }, i) => {
    if (error) fail(`${labels[i]}: ${error.message}`, "migrations applied? `npm run db:reset`");
    else if ((count ?? 0) < expected[i]) fail(`${labels[i]}: ${count}, expected ${expected[i]}`, "seed missing: `npm run db:reset`");
    else ok(`${labels[i]}: ${count}`);
  });

  section("4. DICOM storage");
  let found = 0;
  for (const series of DICOM_SERIES) {
    const { data, error } = await supabase.storage.from("dicom").list(series, { limit: 1000 });
    const hasManifest = data?.some((o) => o.name === "manifest.json");
    if (error || !hasManifest) continue;
    found += 1;
    if (found === 1) {
      const signed = await supabase.storage.from("dicom").createSignedUrl(`${series}/manifest.json`, 60);
      const res = signed.data ? await fetch(signed.data.signedUrl) : null;
      if (res?.ok) ok(`signed URL download works (${series}/manifest.json)`);
      else fail("signed URL download failed", signed.error?.message);
    }
  }
  if (found === DICOM_SERIES.length) ok(`all ${found} phantom series uploaded`);
  else fail(`${found}/${DICOM_SERIES.length} series in the bucket`, "npm run dicom:generate && npm run dicom:upload");
  await supabase.auth.signOut();

  section("5. Service role key (scripts only, never shipped to Vercel)");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    skip("not set (only needed for dicom:upload)");
    return;
  }
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.storage.getBucket("dicom");
  if (error) fail(`service role rejected: ${error.message}`);
  else ok("valid");
}

async function checkOpenAI(env: ServerEnv) {
  section("6. OpenAI");
  if (!env.OPENAI_API_KEY) {
    if (env.AI_PROVIDER === "openai") fail("OPENAI_API_KEY missing");
    else skip(`OPENAI_API_KEY not set (AI_PROVIDER=${env.AI_PROVIDER}, fine for the mock)`);
    return;
  }
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    });
    if (res.status === 401) throw new Error("401 invalid API key");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = (await res.json()) as { data: { id: string }[] };
    ok(`key valid (${data.length} models visible)`);
    if (env.AI_MODEL) {
      if (data.some((m) => m.id === env.AI_MODEL)) ok(`AI_MODEL ${env.AI_MODEL} is available`);
      else
        fail(
          `AI_MODEL ${env.AI_MODEL} not available to this key`,
          `some available: ${data.map((m) => m.id).filter((id) => /^(gpt|o\d)/.test(id)).slice(0, 8).join(", ")}`,
        );
    } else if (env.AI_PROVIDER === "openai") {
      fail("AI_MODEL not set", "set AI_MODEL in the env file to a model id listed for your key");
    }
  } catch (e) {
    fail(`OpenAI check failed: ${errText(e)}`, "check the key at platform.openai.com/api-keys and that billing is set up");
    return;
  }

  if (!liveAi) {
    skip("live generation skipped (add --live-ai to spend ~10 tokens on a real call)");
    return;
  }
  if (!env.AI_MODEL) return;
  try {
    const { generateText } = await import("ai");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    const started = Date.now();
    const { text } = await generateText({
      model: openai(env.AI_MODEL),
      prompt: "Reply with exactly: OK",
      maxOutputTokens: 16,
    });
    ok(`AI SDK generation works in ${Date.now() - started} ms (replied "${text.trim().slice(0, 20)}")`);
  } catch (e) {
    fail(`AI SDK generation failed: ${errText(e)}`, "billing/quota, or the model needs different settings");
  }
}

async function main() {
  console.log("RadPilot setup check");
  const env = await checkEnv();
  if (env) {
    await checkSupabase(env);
    await checkOpenAI(env);
  }
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
