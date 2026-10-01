import { describe, expect, it } from "vitest";
import {
  findWindowLevelPreset,
  formatMeasurementText,
  ManifestInstanceSchema,
  SeriesManifestSchema,
  toMeasurementEvent,
  WINDOW_LEVEL_PRESETS,
} from "./manifest";

describe("WINDOW_LEVEL_PRESETS", () => {
  it("has the four required presets with the agreed center/width", () => {
    expect(findWindowLevelPreset("lung")).toEqual({ id: "lung", label: "Lung", windowCenter: -600, windowWidth: 1500 });
    expect(findWindowLevelPreset("mediastinum")).toEqual({
      id: "mediastinum",
      label: "Mediastinum",
      windowCenter: 40,
      windowWidth: 400,
    });
    expect(findWindowLevelPreset("bone")).toEqual({ id: "bone", label: "Bone", windowCenter: 400, windowWidth: 1800 });
    expect(findWindowLevelPreset("brain")).toEqual({ id: "brain", label: "Brain", windowCenter: 40, windowWidth: 80 });
    expect(WINDOW_LEVEL_PRESETS).toHaveLength(4);
  });
});

describe("formatMeasurementText", () => {
  it('formats as "<mm> mm, series <n> image <instanceNumber>"', () => {
    expect(formatMeasurementText({ lengthMm: 8.4, instanceNumber: 42 })).toBe("8 mm, series 1 image 42");
    expect(formatMeasurementText({ lengthMm: 8.6, instanceNumber: 42, seriesNumber: 3 })).toBe(
      "9 mm, series 3 image 42",
    );
  });
});

describe("toMeasurementEvent", () => {
  it("builds the typed event emitted by the Insert into Findings button", () => {
    const event = toMeasurementEvent({
      lengthMm: 8.0,
      instanceNumber: 42,
      seriesDescription: "CT chest phantom",
      seriesNumber: 3,
    });
    expect(event).toEqual({
      text: "8 mm, series 3 image 42",
      tool: "length",
      valueMm: 8.0,
      seriesDescription: "CT chest phantom",
      instanceNumber: 42,
    });
  });
});

describe("SeriesManifestSchema", () => {
  const instance = {
    file: "0001.dcm",
    instanceNumber: 1,
    sopInstanceUid: "2.25.1",
    imagePositionPatient: [0, 0, 0] as [number, number, number],
  };

  it("parses a well-formed manifest (as written by scripts/dicom/phantoms.ts)", () => {
    const manifest = {
      series: "ct-chest-phantom",
      synthetic: true,
      modality: "CT",
      description: "CT chest phantom",
      studyInstanceUid: "2.25.10",
      seriesInstanceUid: "2.25.11",
      frameOfReferenceUid: "2.25.12",
      rows: 256,
      columns: 256,
      pixelSpacing: [1.4, 1.4],
      sliceThickness: 5,
      window: { center: 40, width: 400 },
      instances: [instance],
    };
    expect(SeriesManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it("rejects an empty instances array", () => {
    expect(() =>
      SeriesManifestSchema.parse({
        series: "x",
        synthetic: true,
        modality: "CR",
        description: "",
        studyInstanceUid: "1",
        seriesInstanceUid: "1",
        frameOfReferenceUid: "1",
        rows: 1,
        columns: 1,
        pixelSpacing: [1, 1],
        sliceThickness: null,
        window: { center: 0, width: 1 },
        instances: [],
      }),
    ).toThrow();
  });

  it("validates one instance with ManifestInstanceSchema", () => {
    expect(ManifestInstanceSchema.parse(instance)).toEqual(instance);
  });
});
