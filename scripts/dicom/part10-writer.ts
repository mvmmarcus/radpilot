/**
 * A tiny, dependency-free DICOM Part 10 writer (Explicit VR Little Endian).
 *
 * It supports exactly what the synthetic phantoms need: string VRs, US/UL
 * integers and OB/OW byte data, all in a flat dataset (no sequences).
 * Reference: DICOM PS3.5 section 7 (data elements) and PS3.10 section 7 (file format).
 */
import { createHash } from "node:crypto";

export const EXPLICIT_VR_LITTLE_ENDIAN = "1.2.840.10008.1.2.1";
export const SOP_CLASS = {
  ctImage: "1.2.840.10008.5.1.4.1.1.2",
  crImage: "1.2.840.10008.5.1.4.1.1.1",
} as const;

/** Root for UIDs derived from a UUID-sized integer (PS3.5 section B.2). */
const UUID_DERIVED_ROOT = "2.25";
const IMPLEMENTATION_CLASS_UID = uidFromSeed("radpilot/implementation");
const IMPLEMENTATION_VERSION_NAME = "RADPILOT_0_1";

export type VR =
  | "AE" | "AS" | "CS" | "DA" | "DS" | "IS" | "LO" | "LT" | "PN" | "SH" | "ST" | "TM" | "UI"
  | "UL" | "US" | "OB" | "OW";

/** VRs whose length field is 4 bytes, after 2 reserved bytes. */
const LONG_LENGTH_VRS = new Set<VR>(["OB", "OW"]);

export interface DicomElement {
  /** (group << 16) | element, e.g. 0x00280010 for Rows. */
  tag: number;
  vr: VR;
  value: string | number | readonly (string | number)[] | Uint8Array;
}

export function tag(group: number, element: number): number {
  return ((group << 16) | element) >>> 0;
}

/**
 * A deterministic UID of the form 2.25.<integer>, where the integer is the
 * first 128 bits of SHA-256(seed). Same seed, same UID, so regenerated files
 * keep their identity.
 */
export function uidFromSeed(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${UUID_DERIVED_ROOT}.${BigInt(`0x${hex}`).toString(10)}`;
}

/** Decimal String: at most 16 characters per value (PS3.5 table 6.2-1). */
export function ds(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`DS value must be finite, got ${value}`);
  const rounded = Number(value.toFixed(6)).toString();
  if (rounded.length > 16) throw new Error(`DS value too long: ${rounded}`);
  return rounded;
}

/** Little-endian bytes of 16-bit pixel samples. */
export function uint16ToBytes(samples: Uint16Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) view.setUint16(i * 2, samples[i], true);
  return bytes;
}

function encodeValue(element: DicomElement): Uint8Array {
  const { vr, value } = element;
  if (vr === "OB" || vr === "OW") {
    if (!(value instanceof Uint8Array)) throw new Error(`${vr} needs a Uint8Array`);
    return padEven(value, 0x00);
  }
  if (value instanceof Uint8Array) throw new Error(`${vr} cannot hold raw bytes`);
  const values = (Array.isArray(value) ? value : [value]) as (string | number)[];
  if (vr === "US" || vr === "UL") {
    const size = vr === "US" ? 2 : 4;
    const bytes = new Uint8Array(values.length * size);
    const view = new DataView(bytes.buffer);
    values.forEach((v, i) => {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
        throw new Error(`${vr} values must be non-negative integers, got ${v}`);
      }
      if (vr === "US") view.setUint16(i * size, v, true);
      else view.setUint32(i * size, v, true);
    });
    return bytes;
  }
  const text = values.map(String).join("\\");
  // UI values are padded with NUL, other strings with a space (PS3.5 section 6.2).
  return padEven(new TextEncoder().encode(text), vr === "UI" ? 0x00 : 0x20);
}

function padEven(bytes: Uint8Array, pad: number): Uint8Array {
  if (bytes.length % 2 === 0) return bytes;
  const out = new Uint8Array(bytes.length + 1);
  out.set(bytes);
  out[bytes.length] = pad;
  return out;
}

function encodeElement(element: DicomElement): Uint8Array {
  const value = encodeValue(element);
  const long = LONG_LENGTH_VRS.has(element.vr);
  const header = new Uint8Array(long ? 12 : 8);
  const view = new DataView(header.buffer);
  view.setUint16(0, element.tag >>> 16, true);
  view.setUint16(2, element.tag & 0xffff, true);
  header[4] = element.vr.charCodeAt(0);
  header[5] = element.vr.charCodeAt(1);
  if (long) {
    view.setUint32(8, value.length, true);
  } else {
    if (value.length > 0xffff) throw new Error(`Value too long for ${element.vr}`);
    view.setUint16(6, value.length, true);
  }
  return concat([header, value]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Serialize a dataset as a Part 10 file: 128-byte preamble, "DICM", the
 * group 0002 file meta information, then the dataset in ascending tag order.
 * SOP Class and SOP Instance UIDs are read from the dataset (0008,0016/0018).
 */
export function writePart10(dataset: readonly DicomElement[]): Uint8Array {
  const find = (t: number) => dataset.find((e) => e.tag === t)?.value;
  const sopClassUid = find(tag(0x0008, 0x0016));
  const sopInstanceUid = find(tag(0x0008, 0x0018));
  if (typeof sopClassUid !== "string" || typeof sopInstanceUid !== "string") {
    throw new Error("Dataset needs SOPClassUID (0008,0016) and SOPInstanceUID (0008,0018)");
  }
  if (dataset.some((e) => e.tag >>> 16 === 0x0002)) {
    throw new Error("Group 0002 is written by writePart10, not by the caller");
  }

  const meta = [
    { tag: tag(0x0002, 0x0001), vr: "OB", value: new Uint8Array([0x00, 0x01]) },
    { tag: tag(0x0002, 0x0002), vr: "UI", value: sopClassUid },
    { tag: tag(0x0002, 0x0003), vr: "UI", value: sopInstanceUid },
    { tag: tag(0x0002, 0x0010), vr: "UI", value: EXPLICIT_VR_LITTLE_ENDIAN },
    { tag: tag(0x0002, 0x0012), vr: "UI", value: IMPLEMENTATION_CLASS_UID },
    { tag: tag(0x0002, 0x0013), vr: "SH", value: IMPLEMENTATION_VERSION_NAME },
  ] satisfies DicomElement[];
  const metaBytes = meta.map(encodeElement);
  const groupLength = encodeElement({
    tag: tag(0x0002, 0x0000),
    vr: "UL",
    value: metaBytes.reduce((n, b) => n + b.length, 0),
  });

  const sorted = [...dataset].sort((a, b) => a.tag - b.tag);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].tag === sorted[i - 1].tag) {
      throw new Error(`Duplicate tag ${sorted[i].tag.toString(16).padStart(8, "0")}`);
    }
  }

  const preamble = new Uint8Array(132);
  preamble.set(new TextEncoder().encode("DICM"), 128);
  return concat([preamble, groupLength, ...metaBytes, ...sorted.map(encodeElement)]);
}
