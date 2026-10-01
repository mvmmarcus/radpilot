import { describe, expect, it } from "vitest";
import { tiradsLevel, tiradsPoints, tiradsRecommendation } from "./tirads";

describe("ACR TI-RADS", () => {
  it("sums points across the 5 categories", () => {
    expect(
      tiradsPoints({ composition: 2, echogenicity: 3, shape: 3, margin: 3, echogenicFoci: 3 }),
    ).toBe(14);
    expect(
      tiradsPoints({ composition: 0, echogenicity: 0, shape: 0, margin: 0, echogenicFoci: 0 }),
    ).toBe(0);
  });

  it("maps points to TR level", () => {
    expect(tiradsLevel(0)).toBe("TR1");
    expect(tiradsLevel(1)).toBe("TR2");
    expect(tiradsLevel(2)).toBe("TR3");
    expect(tiradsLevel(6)).toBe("TR4");
    expect(tiradsLevel(7)).toBe("TR5");
    expect(tiradsLevel(14)).toBe("TR5");
  });

  it("TR3 recommends FNA only once >= 2.5cm, follow-up >= 1.5cm", () => {
    const features = { composition: 1, echogenicity: 1, shape: 0, margin: 0, echogenicFoci: 0 } as const;
    expect(tiradsRecommendation(features, 10).recommendationText).toMatch(/No FNA or follow-up/);
    expect(tiradsRecommendation(features, 16).recommendationText).toMatch(/Follow-up ultrasound/);
    expect(tiradsRecommendation(features, 26).recommendationText).toMatch(/FNA recommended/);
  });

  it("TR5 recommends FNA at 10mm and follow-up at 5mm", () => {
    const features = { composition: 2, echogenicity: 3, shape: 3, margin: 3, echogenicFoci: 3 } as const;
    const result = tiradsRecommendation(features, 10);
    expect(result.level).toBe("TR5");
    expect(result.recommendationText).toMatch(/FNA recommended/);
    expect(tiradsRecommendation(features, 6).recommendationText).toMatch(/Follow-up ultrasound/);
    expect(tiradsRecommendation(features, 3).recommendationText).toMatch(/No FNA or follow-up/);
  });

  it("TR1 and TR2 never require FNA or follow-up", () => {
    const features = { composition: 0, echogenicity: 0, shape: 0, margin: 0, echogenicFoci: 0 } as const;
    expect(tiradsRecommendation(features, 40).recommendationText).toBe("TR1: No FNA or follow-up required.");
  });
});
