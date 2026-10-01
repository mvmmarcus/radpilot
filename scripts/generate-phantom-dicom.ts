/**
 * npm run dicom:generate
 *
 * Writes the synthetic phantom series to supabase/dicom/<series>/ (gitignored):
 * one Part 10 file per instance (0001.dcm, 0002.dcm, ...) and a manifest.json
 * that lists the instances in reading order. Output is deterministic.
 * Upload them with `npm run dicom:upload`.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateSeries, SERIES_NAMES } from "./dicom/phantoms";

const OUTPUT_DIR = join(process.cwd(), "supabase", "dicom");

function main() {
  const only = process.argv.slice(2);
  const names = only.length > 0 ? SERIES_NAMES.filter((n) => only.includes(n)) : SERIES_NAMES;
  if (only.length > 0 && names.length !== only.length) {
    throw new Error(`Unknown series. Choose from: ${SERIES_NAMES.join(", ")}`);
  }

  for (const name of names) {
    const started = performance.now();
    const { manifest, instances } = generateSeries(name);
    const dir = join(OUTPUT_DIR, name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const instance of instances) writeFileSync(join(dir, instance.file), instance.bytes);
    writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

    const megabytes = instances.reduce((n, i) => n + i.bytes.length, 0) / 1024 / 1024;
    const seconds = (performance.now() - started) / 1000;
    console.log(
      `${name.padEnd(24)} ${String(instances.length).padStart(3)} instances  ${megabytes.toFixed(1)} MB  ${seconds.toFixed(1)}s`,
    );
  }
  console.log(`\nWrote ${OUTPUT_DIR}. Next: npm run dicom:upload`);
}

main();
