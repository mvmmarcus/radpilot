import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { SeriesManifestSchema, type SeriesManifest } from "../domain/manifest";

const DICOM_BUCKET = "dicom";
/** Long enough for a reading session; short enough that a shared link expires. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface LoadedInstance {
  manifest: SeriesManifest["instances"][number];
  signedUrl: string;
}

export interface LoadedSeries {
  manifest: SeriesManifest;
  instances: LoadedInstance[];
}

export type LoadSeriesResult =
  | { ok: true; series: LoadedSeries }
  | { ok: false; reason: "manifest_not_found" | "manifest_invalid" | "signed_url_failed"; detail?: string };

/**
 * Load a series from the private `dicom` Storage bucket: manifest.json plus a
 * signed URL per instance, in the order the manifest lists them (reading
 * order). `dicomPath` is `studies.dicom_path`, e.g. "ct-chest-phantom".
 */
export async function loadSeriesForViewer(
  supabase: SupabaseClient<Database>,
  dicomPath: string,
): Promise<LoadSeriesResult> {
  const { data: manifestBlob, error: manifestError } = await supabase.storage
    .from(DICOM_BUCKET)
    .download(`${dicomPath}/manifest.json`);
  if (manifestError || !manifestBlob) {
    return { ok: false, reason: "manifest_not_found", detail: manifestError?.message };
  }

  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(await manifestBlob.text());
  } catch (error) {
    return { ok: false, reason: "manifest_invalid", detail: error instanceof Error ? error.message : String(error) };
  }

  const parsed = SeriesManifestSchema.safeParse(manifestJson);
  if (!parsed.success) {
    return { ok: false, reason: "manifest_invalid", detail: parsed.error.message };
  }
  const manifest = parsed.data;

  const paths = manifest.instances.map((instance) => `${dicomPath}/${instance.file}`);
  const { data: signedUrls, error: signError } = await supabase.storage
    .from(DICOM_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (signError || !signedUrls) {
    return { ok: false, reason: "signed_url_failed", detail: signError?.message };
  }

  const instances: LoadedInstance[] = manifest.instances.map((instanceManifest, index) => {
    const signed = signedUrls[index];
    if (!signed?.signedUrl) {
      throw new Error(`Failed to sign URL for ${paths[index]}: ${signed?.error ?? "unknown error"}`);
    }
    return { manifest: instanceManifest, signedUrl: signed.signedUrl };
  });

  return { ok: true, series: { manifest, instances } };
}
