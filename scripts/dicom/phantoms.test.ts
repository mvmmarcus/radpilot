import * as dicomParserModule from "dicom-parser";
import { beforeAll, describe, expect, it } from "vitest";
import { EXPLICIT_VR_LITTLE_ENDIAN, SOP_CLASS, uidFromSeed } from "./part10-writer";
import {
  axialPixelOf,
  CT_CHEST,
  CT_CHEST_LANDMARKS,
  CT_HEAD,
  CT_HEAD_BRAIN_HU,
  CT_HEAD_HEMATOMA,
  ctHeadLandmarks,
  crLandmarks,
  generateSeries,
  SERIES_NAMES,
  type GeneratedSeries,
  type SeriesName,
} from "./phantoms";

// dicom-parser ships a UMD bundle; depending on the loader its API sits on the
// namespace or on `default`.
const dicomParser =
  (dicomParserModule as unknown as { default?: typeof dicomParserModule }).default ?? dicomParserModule;

type DataSet = ReturnType<typeof dicomParser.parseDicom>;

const series = {} as Record<SeriesName, GeneratedSeries>;

beforeAll(() => {
  for (const name of SERIES_NAMES) series[name] = generateSeries(name);
}, 60_000);

function parse(name: SeriesName, instanceNumber: number): DataSet {
  const instance = series[name].instances[instanceNumber - 1];
  return dicomParser.parseDicom(instance.bytes);
}

/** Stored pixel value at (row, col), after the modality rescale. */
function valueAt(dataSet: DataSet, row: number, col: number): number {
  const pixelData = dataSet.elements.x7fe00010;
  const columns = dataSet.uint16("x00280011") ?? 0;
  const offset = pixelData.dataOffset + (row * columns + col) * 2;
  const stored = dataSet.byteArray[offset] | (dataSet.byteArray[offset + 1] << 8);
  return stored * (dataSet.floatString("x00281053") ?? 1) + (dataSet.floatString("x00281052") ?? 0);
}

/** Median of a (2r+1)^2 patch: robust to noise and to a stray vessel. */
function patchMedian(dataSet: DataSet, row: number, col: number, r = 1): number {
  const values: number[] = [];
  for (let dr = -r; dr <= r; dr++) for (let dc = -r; dc <= r; dc++) values.push(valueAt(dataSet, row + dr, col + dc));
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

describe("part10 writer output, read back with dicom-parser", () => {
  it.each(SERIES_NAMES)("%s has the tags Cornerstone needs", (name) => {
    const { manifest } = series[name];
    const ds = parse(name, 1);

    expect(ds.string("x00020010")).toBe(EXPLICIT_VR_LITTLE_ENDIAN);
    expect(ds.string("x00020002")).toBe(ds.string("x00080016"));
    expect(ds.string("x00020003")).toBe(ds.string("x00080018"));
    expect(ds.string("x00080016")).toBe(manifest.modality === "CT" ? SOP_CLASS.ctImage : SOP_CLASS.crImage);
    expect(ds.string("x00080060")).toBe(manifest.modality);
    expect(ds.string("x0020000d")).toBe(manifest.studyInstanceUid);
    expect(ds.string("x0020000e")).toBe(manifest.seriesInstanceUid);
    expect(ds.string("x00200052")).toBe(manifest.frameOfReferenceUid);
    for (const uidTag of ["x00080016", "x00080018", "x0020000d", "x0020000e", "x00200052"]) {
      const uid = ds.string(uidTag) ?? "";
      expect(uid).toMatch(/^[0-9]+(\.[0-9]+)+$/);
      expect(uid.length).toBeLessThanOrEqual(64);
    }

    expect(ds.uint16("x00280010")).toBe(manifest.rows);
    expect(ds.uint16("x00280011")).toBe(manifest.columns);
    expect(ds.uint16("x00280002")).toBe(1);
    expect(ds.string("x00280004")).toBe("MONOCHROME2");
    expect(ds.uint16("x00280100")).toBe(16);
    expect(ds.uint16("x00280101")).toBe(12);
    expect(ds.uint16("x00280102")).toBe(11);
    expect(ds.uint16("x00280103")).toBe(0);
    expect(ds.floatString("x00280030", 0)).toBe(manifest.pixelSpacing[0]);
    expect(ds.floatString("x00280030", 1)).toBe(manifest.pixelSpacing[1]);
    expect(ds.floatString("x00281050")).toBe(manifest.window.center);
    expect(ds.floatString("x00281051")).toBe(manifest.window.width);
    expect(ds.floatString("x00281053")).toBe(1);
    expect(ds.floatString("x00281052")).toBe(manifest.modality === "CT" ? -1024 : 0);

    const position = [0, 1, 2].map((i) => ds.floatString("x00200032", i));
    expect(position).toEqual(manifest.instances[0].imagePositionPatient);
    expect([0, 1, 2, 3, 4, 5].map((i) => ds.floatString("x00200037", i)).every(Number.isFinite)).toBe(true);

    expect(ds.elements.x7fe00010.length).toBe(manifest.rows * manifest.columns * 2);
  });

  it("writes one manifest entry per instance, in order, with matching UIDs", () => {
    for (const name of SERIES_NAMES) {
      const { manifest, instances } = series[name];
      expect(manifest.synthetic).toBe(true);
      expect(manifest.instances.map((i) => i.file)).toEqual(instances.map((i) => i.file));
      manifest.instances.forEach((entry, index) => {
        expect(entry.instanceNumber).toBe(index + 1);
        expect(entry.file).toBe(`${String(index + 1).padStart(4, "0")}.dcm`);
        expect(parse(name, index + 1).string("x00080018")).toBe(entry.sopInstanceUid);
      });
      expect(new Set(manifest.instances.map((i) => i.sopInstanceUid)).size).toBe(manifest.instances.length);
    }
  });

  it("is deterministic", () => {
    const again = generateSeries("ct-head-phantom");
    expect(again.instances[5].bytes).toEqual(series["ct-head-phantom"].instances[5].bytes);
    expect(uidFromSeed("x")).toBe(uidFromSeed("x"));
    expect(uidFromSeed("x")).not.toBe(uidFromSeed("y"));
  });
});

describe("ct-chest-phantom", () => {
  it("has 40 axial 5 mm slices of 256 x 256 at 1.4 mm, ordered superior to inferior", () => {
    const { manifest } = series["ct-chest-phantom"];
    expect(manifest.instances).toHaveLength(CT_CHEST.slices);
    expect(manifest.sliceThickness).toBe(5);
    const z = manifest.instances.map((i) => i.imagePositionPatient[2]);
    z.slice(1).forEach((value, i) => expect(z[i] - value).toBe(5));
    expect(parse("ct-chest-phantom", 1).floatString("x00180050")).toBe(5);
  });

  it("shows contrast in the pulmonary arteries and a filling defect in the right one", () => {
    const embolus = axialPixelOf(CT_CHEST, CT_CHEST_LANDMARKS.embolus);
    const leftPa = axialPixelOf(CT_CHEST, CT_CHEST_LANDMARKS.leftPulmonaryArtery);
    const embolusHu = patchMedian(parse("ct-chest-phantom", embolus.instanceNumber), embolus.row, embolus.col);
    const leftPaHu = patchMedian(parse("ct-chest-phantom", leftPa.instanceNumber), leftPa.row, leftPa.col);
    expect(leftPaHu).toBeGreaterThan(300);
    expect(embolusHu).toBeGreaterThan(20);
    expect(embolusHu).toBeLessThan(80);
    // The embolus is in the patient's right artery, which is on the image left.
    expect(embolus.col).toBeLessThan(CT_CHEST.columns / 2);
  });

  it("has an 8 mm solid nodule in the right lower lobe", () => {
    const nodule = axialPixelOf(CT_CHEST, CT_CHEST_LANDMARKS.nodule);
    const lung = axialPixelOf(CT_CHEST, CT_CHEST_LANDMARKS.rightLowerLobe);
    const slice = parse("ct-chest-phantom", nodule.instanceNumber);
    expect(patchMedian(slice, nodule.row, nodule.col)).toBeGreaterThan(0);
    expect(patchMedian(slice, lung.row, lung.col, 2)).toBeLessThan(-700);
    expect(nodule.col).toBeLessThan(CT_CHEST.columns / 2); // patient right = image left
    // 8 mm across: about 6 pixels at 1.4 mm.
    let width = 0;
    for (let col = nodule.col - 6; col <= nodule.col + 6; col++) if (valueAt(slice, nodule.row, col) > -300) width++;
    expect(width * CT_CHEST.pixelSpacing).toBeGreaterThanOrEqual(7);
    expect(width * CT_CHEST.pixelSpacing).toBeLessThanOrEqual(9.8);
  });
});

describe("ct-head-phantom", () => {
  it("has 24 slices with a skull ring, brain at 35 HU and a right convexity subdural at 70 HU", () => {
    expect(series["ct-head-phantom"].manifest.instances).toHaveLength(CT_HEAD.slices);
    const { rightConvexity, leftConvexity } = ctHeadLandmarks();
    const right = axialPixelOf(CT_HEAD, rightConvexity);
    const left = axialPixelOf(CT_HEAD, leftConvexity);
    const slice = parse("ct-head-phantom", right.instanceNumber);

    expect(Math.abs(patchMedian(slice, right.row, right.col) - CT_HEAD_HEMATOMA.hu)).toBeLessThan(6);
    expect(Math.abs(patchMedian(slice, left.row, left.col) - CT_HEAD_BRAIN_HU)).toBeLessThan(6);
    expect(right.col).toBeLessThan(CT_HEAD.columns / 2); // patient right = image left

    // Walking outward from the centre along the row meets bone (the skull ring).
    const row = Math.round(CT_HEAD.rows / 2);
    let maxHu = -Infinity;
    for (let col = CT_HEAD.columns / 2; col < CT_HEAD.columns; col++) maxHu = Math.max(maxHu, valueAt(slice, row, col));
    expect(maxHu).toBeGreaterThan(900);
  });

  it("has CSF-density ventricles", () => {
    const ventricle = axialPixelOf(CT_HEAD, [-8, -4, 55]);
    expect(patchMedian(parse("ct-head-phantom", ventricle.instanceNumber), ventricle.row, ventricle.col)).toBeLessThan(15);
  });
});

describe("chest radiographs", () => {
  it("are 512 x 512, 12-bit, MONOCHROME2 single images", () => {
    for (const name of ["cr-chest-normal", "cr-chest-pneumothorax"] as const) {
      const { manifest } = series[name];
      expect(manifest.instances).toHaveLength(1);
      expect([manifest.rows, manifest.columns]).toEqual([512, 512]);
      const ds = parse(name, 1);
      let max = 0;
      for (let row = 0; row < 512; row += 7) for (let col = 0; col < 512; col += 7) max = Math.max(max, valueAt(ds, row, col));
      expect(max).toBeLessThan(4096);
    }
  });

  it("shows a left apical pneumothorax: a pleural line with no lung markings lateral to it", () => {
    const { pneumothoraxSpace, visceralPleuralLine, leftApicalLung } = crLandmarks();
    const normal = parse("cr-chest-normal", 1);
    const ptx = parse("cr-chest-pneumothorax", 1);

    // Patient left = image right.
    expect(pneumothoraxSpace.col).toBeGreaterThan(256);
    // Pleural air is darker than aerated lung at the same spot on the normal film...
    expect(patchMedian(ptx, pneumothoraxSpace.row, pneumothoraxSpace.col)).toBeLessThan(
      patchMedian(normal, pneumothoraxSpace.row, pneumothoraxSpace.col) - 150,
    );
    // ...the visceral pleural line is brighter than the air lateral to it...
    expect(patchMedian(ptx, visceralPleuralLine.row, visceralPleuralLine.col, 0)).toBeGreaterThan(
      patchMedian(ptx, pneumothoraxSpace.row, pneumothoraxSpace.col) + 500,
    );
    // ...and the lung medial to the line is unchanged.
    expect(
      Math.abs(
        patchMedian(ptx, leftApicalLung.row, leftApicalLung.col) -
          patchMedian(normal, leftApicalLung.row, leftApicalLung.col),
      ),
    ).toBeLessThan(100);
  });
});
