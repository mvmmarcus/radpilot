/**
 * Synthetic phantom series for the RadPilot demo. Geometry is defined in
 * patient coordinates (DICOM LPS, millimetres): +x = patient left,
 * +y = posterior, +z = superior. Axial images use ImageOrientationPatient
 * 1\0\0\0\1\0, so the image left is the patient's right, as radiologists read.
 *
 * SYNTHETIC. These are drawings, not patient data.
 */
import { ds, SOP_CLASS, tag, uidFromSeed, uint16ToBytes, writePart10, type DicomElement } from "./part10-writer";

export const SERIES_NAMES = [
  "ct-chest-phantom",
  "ct-head-phantom",
  "cr-chest-normal",
  "cr-chest-pneumothorax",
] as const;
export type SeriesName = (typeof SERIES_NAMES)[number];

export interface ManifestInstance {
  file: string;
  instanceNumber: number;
  sopInstanceUid: string;
  /** ImagePositionPatient of the first pixel, in mm. */
  imagePositionPatient: [number, number, number];
}

/** supabase/dicom/<series>/manifest.json. Instances are listed in reading order. */
export interface SeriesManifest {
  series: SeriesName;
  synthetic: true;
  modality: "CT" | "CR";
  description: string;
  studyInstanceUid: string;
  seriesInstanceUid: string;
  frameOfReferenceUid: string;
  rows: number;
  columns: number;
  pixelSpacing: [number, number];
  sliceThickness: number | null;
  window: { center: number; width: number };
  instances: ManifestInstance[];
}

export interface GeneratedInstance {
  file: string;
  bytes: Uint8Array;
}

export interface GeneratedSeries {
  manifest: SeriesManifest;
  instances: GeneratedInstance[];
}

// ---------------------------------------------------------------------------
// Small geometry and noise helpers
// ---------------------------------------------------------------------------

type Vec3 = readonly [number, number, number];

/** Deterministic PRNG (mulberry32), so every run writes identical files. */
function prng(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roughly normal noise with the given standard deviation (sum of uniforms). */
function noiseSource(seed: string, sd: number): () => number {
  const rand = prng(seed);
  return () => (rand() + rand() + rand() - 1.5) * 2 * sd;
}

function inEllipse(x: number, y: number, cx: number, cy: number, a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  const dx = (x - cx) / a;
  const dy = (y - cy) / b;
  return dx * dx + dy * dy < 1;
}

/** Squared distance from p to segment ab, and the segment parameter t in [0, 1]. */
function segmentDistance2(p: Vec3, a: Vec3, b: Vec3): { d2: number; t: number } {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len2));
  const dx = ap[0] - ab[0] * t;
  const dy = ap[1] - ab[1] * t;
  const dz = ap[2] - ab[2] * t;
  return { d2: dx * dx + dy * dy + dz * dz, t };
}

/** A tube from a to b whose radius tapers linearly from r0 to r1. */
interface Vessel {
  a: Vec3;
  b: Vec3;
  r0: number;
  r1: number;
}

/** Axis-aligned bounds of a vessel in the plane z, or null if it does not reach z. */
function vesselBoundsAt(v: Vessel, z: number): { x0: number; x1: number; y0: number; y1: number } | null {
  const r = Math.max(v.r0, v.r1);
  if (z < Math.min(v.a[2], v.b[2]) - r || z > Math.max(v.a[2], v.b[2]) + r) return null;
  return {
    x0: Math.min(v.a[0], v.b[0]) - r,
    x1: Math.max(v.a[0], v.b[0]) + r,
    y0: Math.min(v.a[1], v.b[1]) - r,
    y1: Math.max(v.a[1], v.b[1]) + r,
  };
}

function inVessel(p: Vec3, v: Vessel): boolean {
  const { d2, t } = segmentDistance2(p, v.a, v.b);
  const r = v.r0 + (v.r1 - v.r0) * t;
  return d2 < r * r;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// CT chest: CTA with a right pulmonary artery filling defect and an 8 mm
// solid nodule in the right lower lobe.
// ---------------------------------------------------------------------------

export const CT_CHEST = {
  rows: 256,
  columns: 256,
  pixelSpacing: 1.4,
  sliceThickness: 5,
  slices: 40,
  /** z of the first (most superior) slice; slices go inferiorly in 5 mm steps. */
  firstSliceZ: 100,
  rescaleIntercept: -1024,
  window: { center: 40, width: 400 },
} as const;

const RIGHT_HILUM: Vec3 = [-58, 0, 2];
const LEFT_HILUM: Vec3 = [58, 5, 8];

const RIGHT_PULMONARY_ARTERY: Vessel = { a: [25, -30, 5], b: RIGHT_HILUM, r0: 10, r1: 9 };

function along(v: Vessel, t: number): Vec3 {
  return [v.a[0] + (v.b[0] - v.a[0]) * t, v.a[1] + (v.b[1] - v.a[1]) * t, v.a[2] + (v.b[2] - v.a[2]) * t];
}

/** Pulmonary arteries, contrast-filled (about 350 HU). */
const PULMONARY_ARTERIES: Vessel[] = [
  { a: [30, -38, -8], b: [30, -36, 8], r0: 14, r1: 14 }, // pulmonary trunk
  RIGHT_PULMONARY_ARTERY,
  { a: [30, -34, 10], b: LEFT_HILUM, r0: 10, r1: 9 }, // left pulmonary artery
  { a: RIGHT_HILUM, b: [-76, 30, -72], r0: 7, r1: 3 }, // right interlobar / lower lobe artery
  { a: RIGHT_HILUM, b: [-70, -12, 62], r0: 6, r1: 2.5 }, // right upper lobe artery
  { a: LEFT_HILUM, b: [72, 30, -76], r0: 7, r1: 3 }, // left lower lobe artery
  { a: LEFT_HILUM, b: [66, -8, 66], r0: 6, r1: 2.5 }, // left upper lobe artery
];

/**
 * Acute embolus: a central low-attenuation filling defect in the right pulmonary
 * artery (contrast still flows around it), extending into the interlobar artery.
 */
const EMBOLI: Vessel[] = [
  { a: along(RIGHT_PULMONARY_ARTERY, 0.42), b: along(RIGHT_PULMONARY_ARTERY, 0.88), r0: 5.5, r1: 5.5 },
  { a: RIGHT_HILUM, b: [-63, 9, -20], r0: 3.5, r1: 2.5 },
];

/** 8 mm solid nodule in the right lower lobe (patient right = image left). */
export const CT_CHEST_NODULE = { center: [-92, 40, -60] as Vec3, radius: 4, hu: 30 };

function chestLungScale(z: number, bottom: number): number {
  const apex = clamp((115 - z) / 60, 0.3, 1);
  const base = Math.sqrt(clamp((z - bottom) / 25, 0, 1));
  return apex * base;
}

function makePeripheralVessels(seed: string): Vessel[] {
  const rand = prng(seed);
  const vessels: Vessel[] = [];
  for (const [hilum, side] of [[RIGHT_HILUM, -1], [LEFT_HILUM, 1]] as const) {
    for (let i = 0; i < 26; i++) {
      const z = hilum[2] + (rand() * 2 - 1) * 85;
      const end: Vec3 = [side * (70 + rand() * 45), -55 + rand() * 115, z];
      vessels.push({ a: hilum, b: end, r0: 2.2, r1: 0.8 });
    }
  }
  return vessels;
}

type BoundedVessel = Vessel & { bounds: { x0: number; x1: number; y0: number; y1: number } };

function ctChestHu(p: Vec3, peripheral: readonly BoundedVessel[]): number {
  const [x, y, z] = p;

  if (!inEllipse(x, y, 0, 5, 165, 115)) return -1000;
  let hu = inEllipse(x, y, 0, 5, 150, 100) ? 40 : -100; // muscle inside, subcutaneous fat outside

  // Mediastinal fat.
  if (inEllipse(x, y, 4, -32, 46, 66)) hu = -80;

  // Lungs, shrinking toward the apices and above the hemidiaphragms (right is higher).
  const rightScale = chestLungScale(z, -82);
  const leftScale = chestLungScale(z, -92);
  const inRightLung = inEllipse(x, y, -78, 5, 58 * rightScale, 82 * Math.sqrt(rightScale));
  const inLeftLung = inEllipse(x, y, 78, 5, 55 * leftScale, 82 * Math.sqrt(leftScale));
  const inLung = inRightLung || inLeftLung;
  if (inLung) {
    hu = -860;
    for (const v of peripheral) {
      const { x0, x1, y0, y1 } = v.bounds;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && inVessel(p, v)) hu = 120;
    }
  }

  // Below the right hemidiaphragm: liver dome. Below the left: stomach and spleen.
  if (!inLung && z < -70 && inEllipse(x, y, 0, 5, 150, 100) && Math.abs(x) > 30) hu = x < 0 ? 100 : 45;

  // Heart, with contrast in the chambers.
  const heartScale = Math.sqrt(clamp(1 - ((z + 52) / 38) ** 2, 0, 1));
  if (inEllipse(x, y, 18, -30, 62 * heartScale, 50 * heartScale)) {
    hu = inEllipse(x, y, 18, -30, 62 * heartScale - 9, 50 * heartScale - 9) ? 260 : 90;
  }

  // Great vessels.
  if (z > -15 && z < 48 && inEllipse(x, y, 12, -42, 15, 15)) hu = 280; // ascending aorta
  if (z >= 45 && z < 60 && inVessel(p, { a: [10, -42, 52], b: [26, 46, 52], r0: 13, r1: 12 })) hu = 280; // arch
  if (z < 58 && inEllipse(x, y, 28, 50, 12, 12)) hu = 280; // descending aorta
  if (z > -12 && z < 62 && inEllipse(x, y, -28, -36, 10, 10)) hu = 420; // SVC, dense inflow

  for (const v of PULMONARY_ARTERIES) if (inVessel(p, v)) hu = 350;
  for (const v of EMBOLI) if (inVessel(p, v)) hu = 45;

  // Spine, sternum and ribs.
  if (inEllipse(x, y, 0, 62, 17, 17)) hu = inEllipse(x, y, 0, 62, 15, 15) ? 250 : 700;
  if (inEllipse(x, y, 0, 88, 14, 14) && y > 78) hu = 500; // posterior elements
  if (inEllipse(x, y, 0, 88, 8, 8)) hu = 20; // spinal canal
  if (Math.abs(x) < 4 && y > 100 && y < 114) hu = 500; // spinous process
  if (z > -75 && z < 55 && Math.abs(x) < 14 && y > -110 && y < -100) hu = 450; // sternum
  for (let k = 0; k < 9; k++) {
    const angle = (k * 24 + 205 + ((z * 1.7) % 24)) * (Math.PI / 180);
    for (const side of [-1, 1]) {
      const rx = side * Math.abs(Math.cos(angle)) * 148;
      const ry = 5 + Math.sin(angle) * 98;
      if (ry < -60) continue; // anterior ribs are cartilage at this level
      if ((x - rx) ** 2 + (y - ry) ** 2 < 25) hu = 650;
    }
  }

  // The nodule goes last, so nothing overdraws it.
  const n = CT_CHEST_NODULE;
  if ((x - n.center[0]) ** 2 + (y - n.center[1]) ** 2 + (z - n.center[2]) ** 2 < n.radius ** 2) hu = n.hu;

  return hu;
}

// ---------------------------------------------------------------------------
// CT head: skull, brain at 35 HU, CSF ventricles and an acute right
// convexity subdural hematoma (70 HU) with mild leftward midline shift.
// ---------------------------------------------------------------------------

export const CT_HEAD = {
  rows: 256,
  columns: 256,
  pixelSpacing: 0.9,
  sliceThickness: 5,
  slices: 24,
  firstSliceZ: 120,
  rescaleIntercept: -1024,
  window: { center: 40, width: 80 },
} as const;

const HEAD = { center: [0, 0, 40] as Vec3, a: 75, b: 95, c: 85 };
export const CT_HEAD_HEMATOMA = { hu: 70, zCenter: 75, zHalfExtent: 32, maxThickness: 10 };
export const CT_HEAD_BRAIN_HU = 35;
const MIDLINE_SHIFT = 3;

function headScale(z: number): number {
  return Math.sqrt(clamp(1 - ((z - HEAD.center[2]) / HEAD.c) ** 2, 0, 1));
}

/** Semi-axes of the inner table of the skull at height z. */
export function headInnerTable(z: number): { a: number; b: number } {
  const s = headScale(z);
  return { a: HEAD.a * s - 12, b: HEAD.b * s - 12 };
}

/** Points worth probing in the head phantom: both convexities at the hematoma's widest slice. */
export function ctHeadLandmarks(): { rightConvexity: Vec3; leftConvexity: Vec3 } {
  const z = CT_HEAD_HEMATOMA.zCenter;
  const { a } = headInnerTable(z);
  return { rightConvexity: [-(a - 3), 0, z], leftConvexity: [a - 3, 0, z] };
}

function ctHeadHu(p: Vec3): number {
  const [x, y, z] = p;
  const s = headScale(z);
  const a = HEAD.a * s;
  const b = HEAD.b * s;
  if (!inEllipse(x, y, 0, 0, a, b)) return -1000;
  if (!inEllipse(x, y, 0, 0, a - 5, b - 5)) return 30; // scalp
  if (!inEllipse(x, y, 0, 0, a - 12, b - 12)) return 1100; // skull

  const inner = headInnerTable(z);
  let hu = CT_HEAD_BRAIN_HU;

  // Subdural hematoma: between the inner table and a brain surface pushed to the left.
  const h = CT_HEAD_HEMATOMA;
  const d = (h.maxThickness / 2) * Math.sqrt(clamp(1 - ((z - h.zCenter) / h.zHalfExtent) ** 2, 0, 1));
  if (d > 0.5 && x < 0 && !inEllipse(x, y, d, 0, inner.a - d, inner.b - 0.3 * d)) hu = h.hu;

  // Lateral ventricles (frontal horns anterior), third ventricle, all shifted to the left.
  if (z > 35 && z < 72) {
    const taper = Math.sqrt(clamp(1 - ((z - 53) / 19) ** 2, 0, 1));
    for (const side of [-1, 1]) {
      if (inEllipse(x, y, side * 11 + MIDLINE_SHIFT, -4, 6 * taper, 27 * taper)) hu = 5;
    }
  }
  if (z > 24 && z < 40 && inEllipse(x, y, MIDLINE_SHIFT, 2, 2.2, 11)) hu = 5;

  return hu;
}

// ---------------------------------------------------------------------------
// Chest radiographs (PA): normal, and a left apical pneumothorax after a left
// subclavian line. 512 x 512, 12-bit, MONOCHROME2 (higher value = whiter).
// Normalized image coordinates: u in [-1, 1] (image left = patient right),
// v in [0, 1] from top to bottom.
// ---------------------------------------------------------------------------

export const CR_CHEST = {
  rows: 512,
  columns: 512,
  pixelSpacing: 0.8,
  bitsStored: 12,
  window: { center: 1900, width: 3600 },
} as const;

const LUNGS = {
  right: { side: -1, cx: -0.4, cy: 0.5, ax: 0.27, ay: 0.36 },
  left: { side: 1, cx: 0.4, cy: 0.53, ax: 0.26, ay: 0.35 },
} as const;
const PTX_DIRECTION = { x: Math.sin(Math.PI / 6), y: -Math.cos(Math.PI / 6) }; // apicolateral
const PTX_MAX_GAP = 0.28;

function ptxGap(px: number, py: number): number {
  const rho = Math.hypot(px, py);
  if (rho === 0) return 0;
  const up = Math.max(0, (px * PTX_DIRECTION.x + py * PTX_DIRECTION.y) / rho);
  return PTX_MAX_GAP * up ** 1.5;
}

/** Pixel landmarks the tests (and a curious reader) can probe. */
export function crLandmarks(): Record<
  "pneumothoraxSpace" | "visceralPleuralLine" | "leftApicalLung",
  { row: number; col: number }
> {
  const lung = LUNGS.left;
  const toPixel = (rho: number) => {
    const u = lung.cx + rho * PTX_DIRECTION.x * lung.ax;
    const v = lung.cy + rho * PTX_DIRECTION.y * lung.ay;
    return { row: Math.round(v * CR_CHEST.rows - 0.5), col: Math.round(((u + 1) / 2) * CR_CHEST.columns - 0.5) };
  };
  // Along the apicolateral ray the visceral pleural line sits at rho = 1 - PTX_MAX_GAP.
  // Lateral to it is pleural air; medial to it the collapsed lung keeps its markings.
  return {
    pneumothoraxSpace: toPixel(0.92),
    visceralPleuralLine: toPixel(1 - PTX_MAX_GAP),
    leftApicalLung: toPixel(0.55),
  };
}

interface Stroke {
  a: [number, number];
  b: [number, number];
  w0: number;
  w1: number;
}

function strokeHit(u: number, v: number, s: Stroke): boolean {
  const { d2, t } = segmentDistance2([u, v, 0], [s.a[0], s.a[1], 0], [s.b[0], s.b[1], 0]);
  const w = s.w0 + (s.w1 - s.w0) * t;
  return d2 < w * w;
}

function makeLungMarkings(seed: string): Stroke[] {
  const rand = prng(seed);
  const strokes: Stroke[] = [];
  for (const lung of [LUNGS.right, LUNGS.left]) {
    const hilum: [number, number] = [lung.side * 0.17, 0.47];
    // A few trunks from the hilum, each splitting twice: vessels taper toward the periphery.
    for (let i = 0; i < 12; i++) {
      const angle = -Math.PI * 0.85 + rand() * Math.PI * 1.15;
      let from = hilum;
      let heading = angle;
      let width = 0.007;
      for (let generation = 0; generation < 3; generation++) {
        const len = (0.32 - generation * 0.07) * (0.7 + rand() * 0.6);
        const to: [number, number] = [
          from[0] + lung.side * Math.abs(Math.cos(heading)) * lung.ax * 2 * len,
          from[1] + Math.sin(heading) * lung.ay * len,
        ];
        strokes.push({ a: from, b: to, w0: width, w1: width * 0.6 });
        const fork = heading + (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.3);
        const forkLen = len * 0.6;
        strokes.push({
          a: to,
          b: [
            to[0] + lung.side * Math.abs(Math.cos(fork)) * lung.ax * 2 * forkLen,
            to[1] + Math.sin(fork) * lung.ay * forkLen,
          ],
          w0: width * 0.5,
          w1: width * 0.3,
        });
        from = to;
        heading += (rand() - 0.5) * 0.4;
        width *= 0.6;
      }
    }
  }
  return strokes;
}

/** Left subclavian central venous catheter: lateral left subclavian vein to the SVC. */
const CATHETER: Stroke[] = [
  { a: [0.62, 0.15], b: [0.3, 0.2], w0: 0.004, w1: 0.004 },
  { a: [0.3, 0.2], b: [0.04, 0.27], w0: 0.004, w1: 0.004 },
  { a: [0.04, 0.27], b: [-0.06, 0.4], w0: 0.004, w1: 0.004 },
];

function crChestValue(u: number, v: number, markings: Stroke[], pneumothorax: boolean): number {
  // Body outline: neck, shoulders, thorax.
  const halfWidth = v < 0.06 ? 0.2 : v < 0.16 ? 0.2 + ((v - 0.06) / 0.1) * 0.6 : 0.8 - 0.08 * (v - 0.16);
  if (Math.abs(u) > halfWidth) return 150;
  let value = 1900;

  // Lungs.
  let lungValue: number | null = null;
  for (const lung of [LUNGS.right, LUNGS.left]) {
    const px = (u - lung.cx) / lung.ax;
    const py = (v - lung.cy) / lung.ay;
    const rho = Math.hypot(px, py);
    if (rho >= 1 || Math.abs(u) < 0.11) continue;
    const gap = pneumothorax && lung.side === 1 ? ptxGap(px, py) : 0;
    const visceral = 1 - gap;
    if (gap > 0.02 && Math.abs(rho - visceral) < 0.012) {
      lungValue = 1500; // visceral pleural line
    } else if (gap > 0.02 && rho > visceral) {
      lungValue = 430; // pleural air: darker, and no lung markings
    } else {
      lungValue = 700 + 260 * (1 - rho); // denser toward the hilum
      if (markings.some((s) => strokeHit(u, v, s))) lungValue += 220;
    }
  }
  if (lungValue !== null) value = lungValue;

  // Below the diaphragm: the stomach bubble under the left hemidiaphragm.
  if (lungValue === null && v > 0.8 && inEllipse(u, v, 0.3, 0.88, 0.07, 0.045)) value = 900;

  // Mediastinum and heart (the heart extends more to the patient's left).
  if (Math.abs(u) < 0.12 && v > 0.08 && v < 0.62) value = 2300;
  if (inEllipse(u, v, 0.07, 0.69, 0.23, 0.16)) value = 2400;
  if (Math.abs(u) < 0.025 && v > 0.02 && v < 0.38) value = 1200; // trachea

  // Bones: spine, clavicles and posterior ribs.
  if (Math.abs(u) < 0.05) value += 250;
  for (const side of [-1, 1]) {
    if (strokeHit(u, v, { a: [side * 0.08, 0.17], b: [side * 0.56, 0.12], w0: 0.017, w1: 0.012 })) value += 700;
  }
  if (Math.abs(u) > 0.08 && Math.abs(u) < 0.72) {
    for (let k = 0; k < 10; k++) {
      const x = Math.abs(u) - 0.08;
      const ribV = 0.16 + k * 0.068 - 0.06 * x + 0.32 * x * x; // posterior ribs curve down laterally
      if (Math.abs(v - ribV) < 0.011) value += 280;
    }
  }

  if (pneumothorax && CATHETER.some((s) => strokeHit(u, v, s))) value = 3700;

  return value;
}

// ---------------------------------------------------------------------------
// Series builders
// ---------------------------------------------------------------------------

function studyUids(series: SeriesName) {
  return {
    study: uidFromSeed(`radpilot/study/${series}`),
    series: uidFromSeed(`radpilot/series/${series}`),
    frameOfReference: uidFromSeed(`radpilot/frame-of-reference/${series}`),
  };
}

const PATIENT_TAGS = (series: SeriesName): DicomElement[] => [
  { tag: tag(0x0010, 0x0010), vr: "PN", value: `Phantom^${series}` },
  { tag: tag(0x0010, 0x0020), vr: "LO", value: `PHANTOM-${series.toUpperCase()}` },
  { tag: tag(0x0010, 0x0040), vr: "CS", value: "O" },
];

interface ImageSpec {
  series: SeriesName;
  modality: "CT" | "CR";
  description: string;
  rows: number;
  columns: number;
  pixelSpacing: number;
  bitsStored: number;
  rescaleIntercept: number;
  rescaleType: string;
  window: { center: number; width: number };
  sliceThickness: number | null;
  imageOrientation: [number, number, number, number, number, number];
  imageType: string[];
}

function buildInstance(
  spec: ImageSpec,
  instanceNumber: number,
  position: [number, number, number],
  pixels: Uint16Array,
): { manifest: ManifestInstance; bytes: Uint8Array } {
  const uids = studyUids(spec.series);
  const sopClassUid = spec.modality === "CT" ? SOP_CLASS.ctImage : SOP_CLASS.crImage;
  const sopInstanceUid = uidFromSeed(`radpilot/instance/${spec.series}/${instanceNumber}`);
  const highBit = spec.bitsStored - 1;

  const dataset: DicomElement[] = [
    { tag: tag(0x0008, 0x0005), vr: "CS", value: "ISO_IR 100" },
    { tag: tag(0x0008, 0x0008), vr: "CS", value: spec.imageType },
    { tag: tag(0x0008, 0x0016), vr: "UI", value: sopClassUid },
    { tag: tag(0x0008, 0x0018), vr: "UI", value: sopInstanceUid },
    { tag: tag(0x0008, 0x0020), vr: "DA", value: "20260101" },
    { tag: tag(0x0008, 0x0030), vr: "TM", value: "080000" },
    { tag: tag(0x0008, 0x0050), vr: "SH", value: "" },
    { tag: tag(0x0008, 0x0060), vr: "CS", value: spec.modality },
    { tag: tag(0x0008, 0x0070), vr: "LO", value: "RadPilot synthetic phantom" },
    { tag: tag(0x0008, 0x103e), vr: "LO", value: spec.description },
    ...PATIENT_TAGS(spec.series),
    { tag: tag(0x0020, 0x000d), vr: "UI", value: uids.study },
    { tag: tag(0x0020, 0x000e), vr: "UI", value: uids.series },
    { tag: tag(0x0020, 0x0011), vr: "IS", value: "1" },
    { tag: tag(0x0020, 0x0013), vr: "IS", value: String(instanceNumber) },
    { tag: tag(0x0020, 0x0032), vr: "DS", value: position.map(ds) },
    { tag: tag(0x0020, 0x0037), vr: "DS", value: spec.imageOrientation.map(ds) },
    { tag: tag(0x0020, 0x0052), vr: "UI", value: uids.frameOfReference },
    { tag: tag(0x0028, 0x0002), vr: "US", value: 1 },
    { tag: tag(0x0028, 0x0004), vr: "CS", value: "MONOCHROME2" },
    { tag: tag(0x0028, 0x0010), vr: "US", value: spec.rows },
    { tag: tag(0x0028, 0x0011), vr: "US", value: spec.columns },
    { tag: tag(0x0028, 0x0030), vr: "DS", value: [ds(spec.pixelSpacing), ds(spec.pixelSpacing)] },
    { tag: tag(0x0028, 0x0100), vr: "US", value: 16 },
    { tag: tag(0x0028, 0x0101), vr: "US", value: spec.bitsStored },
    { tag: tag(0x0028, 0x0102), vr: "US", value: highBit },
    { tag: tag(0x0028, 0x0103), vr: "US", value: 0 },
    { tag: tag(0x0028, 0x1050), vr: "DS", value: ds(spec.window.center) },
    { tag: tag(0x0028, 0x1051), vr: "DS", value: ds(spec.window.width) },
    { tag: tag(0x0028, 0x1052), vr: "DS", value: ds(spec.rescaleIntercept) },
    { tag: tag(0x0028, 0x1053), vr: "DS", value: "1" },
    { tag: tag(0x0028, 0x1054), vr: "LO", value: spec.rescaleType },
    { tag: tag(0x7fe0, 0x0010), vr: "OW", value: uint16ToBytes(pixels) },
  ];
  if (spec.modality === "CT") {
    dataset.push(
      { tag: tag(0x0018, 0x0050), vr: "DS", value: ds(spec.sliceThickness ?? 0) },
      { tag: tag(0x0018, 0x5100), vr: "CS", value: "HFS" },
      { tag: tag(0x0020, 0x1041), vr: "DS", value: ds(position[2]) },
    );
  } else {
    dataset.push(
      { tag: tag(0x0018, 0x1164), vr: "DS", value: [ds(spec.pixelSpacing), ds(spec.pixelSpacing)] },
      { tag: tag(0x0020, 0x0020), vr: "CS", value: ["L", "F"] },
    );
  }

  const file = `${String(instanceNumber).padStart(4, "0")}.dcm`;
  return {
    manifest: { file, instanceNumber, sopInstanceUid, imagePositionPatient: position },
    bytes: writePart10(dataset),
  };
}

function finishSeries(spec: ImageSpec, built: { manifest: ManifestInstance; bytes: Uint8Array }[]): GeneratedSeries {
  const uids = studyUids(spec.series);
  return {
    manifest: {
      series: spec.series,
      synthetic: true,
      modality: spec.modality,
      description: spec.description,
      studyInstanceUid: uids.study,
      seriesInstanceUid: uids.series,
      frameOfReferenceUid: uids.frameOfReference,
      rows: spec.rows,
      columns: spec.columns,
      pixelSpacing: [spec.pixelSpacing, spec.pixelSpacing],
      sliceThickness: spec.sliceThickness,
      window: spec.window,
      instances: built.map((b) => b.manifest),
    },
    instances: built.map((b) => ({ file: b.manifest.file, bytes: b.bytes })),
  };
}

/** Top-left pixel centre of an axial image centred on the scanner isocentre. */
function axialOrigin(size: number, spacing: number): number {
  return -((size - 1) / 2) * spacing;
}

function buildAxialSeries(
  spec: ImageSpec & { slices: number; firstSliceZ: number; noiseSd: number },
  /** Returns the HU function for one slice, so per-slice work is done once. */
  sliceAt: (z: number) => (p: Vec3) => number,
): GeneratedSeries {
  const noise = noiseSource(spec.series, spec.noiseSd);
  const origin = axialOrigin(spec.columns, spec.pixelSpacing);
  const built = [];
  for (let i = 0; i < spec.slices; i++) {
    const z = spec.firstSliceZ - i * (spec.sliceThickness ?? 0);
    const huAt = sliceAt(z);
    const pixels = new Uint16Array(spec.rows * spec.columns);
    for (let row = 0; row < spec.rows; row++) {
      const y = origin + row * spec.pixelSpacing;
      for (let col = 0; col < spec.columns; col++) {
        const x = origin + col * spec.pixelSpacing;
        const hu = huAt([x, y, z]);
        const n = hu === -1000 ? 0 : noise();
        pixels[row * spec.columns + col] = clamp(Math.round(hu + n - spec.rescaleIntercept), 0, 4095);
      }
    }
    built.push(buildInstance(spec, i + 1, [origin, origin, z], pixels));
  }
  return finishSeries(spec, built);
}

/** Pixel (row, col) and instance number of a point in an axial phantom. */
export function axialPixelOf(
  geometry: { rows: number; columns: number; pixelSpacing: number; sliceThickness: number; firstSliceZ: number },
  point: Vec3,
): { instanceNumber: number; row: number; col: number } {
  const origin = axialOrigin(geometry.columns, geometry.pixelSpacing);
  return {
    instanceNumber: Math.round((geometry.firstSliceZ - point[2]) / geometry.sliceThickness) + 1,
    row: Math.round((point[1] - origin) / geometry.pixelSpacing),
    col: Math.round((point[0] - origin) / geometry.pixelSpacing),
  };
}

/** Points worth probing in the chest phantom, in patient coordinates. */
export const CT_CHEST_LANDMARKS = {
  nodule: CT_CHEST_NODULE.center,
  /** Centre of the embolus inside the right pulmonary artery. */
  embolus: along(RIGHT_PULMONARY_ARTERY, 0.65),
  /** Contrast-filled lumen of the left pulmonary artery at the same level. */
  leftPulmonaryArtery: [44, -15, 9] as Vec3,
  /** Aerated right lower lobe next to the nodule. */
  rightLowerLobe: [-80, 40, -60] as Vec3,
};

function ctChest(): GeneratedSeries {
  const peripheral = makePeripheralVessels("ct-chest-phantom/vessels");
  return buildAxialSeries(
    {
      series: "ct-chest-phantom",
      modality: "CT",
      description: "CTA chest, synthetic phantom",
      rows: CT_CHEST.rows,
      columns: CT_CHEST.columns,
      pixelSpacing: CT_CHEST.pixelSpacing,
      bitsStored: 12,
      rescaleIntercept: CT_CHEST.rescaleIntercept,
      rescaleType: "HU",
      window: CT_CHEST.window,
      sliceThickness: CT_CHEST.sliceThickness,
      imageOrientation: [1, 0, 0, 0, 1, 0],
      imageType: ["ORIGINAL", "PRIMARY", "AXIAL"],
      slices: CT_CHEST.slices,
      firstSliceZ: CT_CHEST.firstSliceZ,
      noiseSd: 8,
    },
    (z) => {
      // Only test the vessels that reach this slice.
      const local = peripheral.flatMap((v) => {
        const bounds = vesselBoundsAt(v, z);
        return bounds ? [{ ...v, bounds }] : [];
      });
      return (p) => ctChestHu(p, local);
    },
  );
}

function ctHead(): GeneratedSeries {
  return buildAxialSeries(
    {
      series: "ct-head-phantom",
      modality: "CT",
      description: "CT head without contrast, synthetic phantom",
      rows: CT_HEAD.rows,
      columns: CT_HEAD.columns,
      pixelSpacing: CT_HEAD.pixelSpacing,
      bitsStored: 12,
      rescaleIntercept: CT_HEAD.rescaleIntercept,
      rescaleType: "HU",
      window: CT_HEAD.window,
      sliceThickness: CT_HEAD.sliceThickness,
      imageOrientation: [1, 0, 0, 0, 1, 0],
      imageType: ["ORIGINAL", "PRIMARY", "AXIAL"],
      slices: CT_HEAD.slices,
      firstSliceZ: CT_HEAD.firstSliceZ,
      noiseSd: 2.5,
    },
    () => ctHeadHu,
  );
}

function crChest(series: "cr-chest-normal" | "cr-chest-pneumothorax"): GeneratedSeries {
  const pneumothorax = series === "cr-chest-pneumothorax";
  const markings = makeLungMarkings("cr-chest/markings");
  const noise = noiseSource(series, 14);
  const { rows, columns, pixelSpacing } = CR_CHEST;
  const pixels = new Uint16Array(rows * columns);
  for (let row = 0; row < rows; row++) {
    const v = (row + 0.5) / rows;
    for (let col = 0; col < columns; col++) {
      const u = ((col + 0.5) / columns) * 2 - 1;
      const value = crChestValue(u, v, markings, pneumothorax);
      pixels[row * columns + col] = clamp(Math.round(value + noise()), 0, 4095);
    }
  }
  const half = ((columns - 1) / 2) * pixelSpacing;
  const spec: ImageSpec = {
    series,
    modality: "CR",
    description: pneumothorax ? "XR chest AP portable, synthetic phantom" : "XR chest PA, synthetic phantom",
    rows,
    columns,
    pixelSpacing,
    bitsStored: CR_CHEST.bitsStored,
    rescaleIntercept: 0,
    rescaleType: "US",
    window: CR_CHEST.window,
    sliceThickness: null,
    // Rows run to the patient's left, columns to the feet: a frontal view facing the patient.
    imageOrientation: [1, 0, 0, 0, 0, -1],
    imageType: ["ORIGINAL", "PRIMARY"],
  };
  return finishSeries(spec, [buildInstance(spec, 1, [-half, 0, half], pixels)]);
}

export function generateSeries(name: SeriesName): GeneratedSeries {
  switch (name) {
    case "ct-chest-phantom":
      return ctChest();
    case "ct-head-phantom":
      return ctHead();
    case "cr-chest-normal":
    case "cr-chest-pneumothorax":
      return crChest(name);
  }
}
