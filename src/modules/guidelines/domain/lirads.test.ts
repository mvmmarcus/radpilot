import { describe, expect, it } from "vitest";
import { liradsCategory, type LiradsObservation } from "./lirads";

const base: LiradsObservation = {
  sizeMm: 15,
  aphe: false,
  washout: false,
  capsule: false,
  thresholdGrowth: false,
  tumorInVein: false,
  malignantNotHccFeatures: false,
};

describe("LI-RADS (simplified CT/MRI major features)", () => {
  it("tumor in vein is always LR-TIV", () => {
    expect(liradsCategory({ ...base, tumorInVein: true, aphe: true, washout: true }).category).toBe("LR-TIV");
  });

  it("features atypical for HCC are LR-M", () => {
    expect(liradsCategory({ ...base, malignantNotHccFeatures: true }).category).toBe("LR-M");
  });

  it("no APHE and no major features is LR-3", () => {
    expect(liradsCategory(base).category).toBe("LR-3");
  });

  it("APHE alone (no additional major feature) is LR-4", () => {
    expect(liradsCategory({ ...base, aphe: true }).category).toBe("LR-4");
  });

  it("a major feature without APHE is LR-4", () => {
    expect(liradsCategory({ ...base, washout: true }).category).toBe("LR-4");
  });

  it(">=20mm with APHE and 1 additional major feature is LR-5", () => {
    expect(liradsCategory({ ...base, sizeMm: 22, aphe: true, washout: true }).category).toBe("LR-5");
  });

  it("10-19mm with APHE and only 1 additional major feature stays LR-4", () => {
    expect(liradsCategory({ ...base, sizeMm: 15, aphe: true, washout: true }).category).toBe("LR-4");
  });

  it("10-19mm with APHE and 2 additional major features is LR-5", () => {
    expect(liradsCategory({ ...base, sizeMm: 15, aphe: true, washout: true, capsule: true }).category).toBe(
      "LR-5",
    );
  });

  it("<10mm never reaches LR-5 even with APHE and major features", () => {
    expect(
      liradsCategory({ ...base, sizeMm: 8, aphe: true, washout: true, capsule: true, thresholdGrowth: true })
        .category,
    ).toBe("LR-4");
  });
});
