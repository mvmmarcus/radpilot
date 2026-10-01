/**
 * npm run dicom:upload
 *
 * Uploads supabase/dicom/** (written by `npm run dicom:generate`) to the private
 * `dicom` Storage bucket with the service role. Object keys mirror the local
 * layout, e.g. ct-chest-phantom/0001.dcm and ct-chest-phantom/manifest.json,
 * which matches studies.dicom_path. Re-running overwrites (upsert).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "dicom";
const SOURCE_DIR = join(process.cwd(), "supabase", "dicom");
const CONCURRENCY = 8;

const CONTENT_TYPES: Record<string, string> = {
  ".dcm": "application/dicom",
  ".json": "application/json",
};

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local " +
        "(`npm run db:start` prints them).",
    );
  }
  return { url, serviceRoleKey };
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function contentTypeFor(path: string): string | undefined {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? undefined : CONTENT_TYPES[path.slice(dot).toLowerCase()];
}

async function main() {
  if (!existsSync(SOURCE_DIR)) {
    throw new Error(`${SOURCE_DIR} does not exist. Run \`npm run dicom:generate\` first.`);
  }
  const { url, serviceRoleKey } = loadEnv();
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const files = listFiles(SOURCE_DIR)
    .map((path) => ({ path, key: relative(SOURCE_DIR, path).split(sep).join("/") }))
    .filter(({ path, key }) => {
      if (contentTypeFor(path)) return true;
      console.warn(`skip ${key} (not .dcm or .json)`);
      return false;
    });
  if (files.length === 0) throw new Error(`No .dcm or .json files under ${SOURCE_DIR}.`);

  let uploaded = 0;
  const failures: string[] = [];
  const queue = [...files];
  async function worker() {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const { error } = await supabase.storage.from(BUCKET).upload(file.key, readFileSync(file.path), {
        contentType: contentTypeFor(file.path),
        upsert: true,
      });
      if (error) failures.push(`${file.key}: ${error.message}`);
      else uploaded += 1;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const series = new Set(files.map((f) => f.key.split("/")[0]));
  console.log(`Uploaded ${uploaded}/${files.length} files (${series.size} series) to the "${BUCKET}" bucket.`);
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
