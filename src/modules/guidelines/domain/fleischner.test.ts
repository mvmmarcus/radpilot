import { describe, expect, it } from "vitest";
import { fleischnerRecommendation } from "./fleischner";

describe("Fleischner 2017 (simplified, solid nodules)", () => {
  it("recommends no follow-up for a small single nodule in a low-risk patient", () => {
    expect(fleischnerRecommendation({ sizeMm: 4, multiple: false, risk: "low" }).followUpText).toBe(
      "No routine follow-up required.",
    );
  });

  it("recommends optional 12-month CT for a small single nodule in a high-risk patient", () => {
    expect(fleischnerRecommendation({ sizeMm: 5, multiple: false, risk: "high" }).followUpText).toBe(
      "Optional CT at 12 months.",
    );
  });

  it("recommends 6-12 month CT for a 6-8mm single nodule, low risk", () => {
    expect(fleischnerRecommendation({ sizeMm: 8, multiple: false, risk: "low" }).followUpText).toBe(
      "CT at 6-12 months, then consider CT at 18-24 months.",
    );
  });

  it("recommends 6-12 then 18-24 month CT for a 6-8mm single nodule, high risk", () => {
    expect(fleischnerRecommendation({ sizeMm: 6, multiple: false, risk: "high" }).followUpText).toBe(
      "CT at 6-12 months, then at 18-24 months.",
    );
  });

  it("recommends CT at 3 months, PET/CT or tissue sampling for a >8mm single nodule", () => {
    expect(fleischnerRecommendation({ sizeMm: 9, multiple: false, risk: "low" }).followUpText).toBe(
      "CT at 3 months, PET/CT, or tissue sampling.",
    );
  });

  it("handles multiple small nodules", () => {
    expect(fleischnerRecommendation({ sizeMm: 3, multiple: true, risk: "low" }).followUpText).toBe(
      "No routine follow-up required.",
    );
    expect(fleischnerRecommendation({ sizeMm: 3, multiple: true, risk: "high" }).followUpText).toBe(
      "CT at 12 months.",
    );
  });

  it("handles multiple nodules >=6mm", () => {
    expect(fleischnerRecommendation({ sizeMm: 7, multiple: true, risk: "low" }).followUpText).toBe(
      "CT at 3-6 months, then consider CT at 18-24 months depending on risk.",
    );
  });

  it("always tags the guideline id", () => {
    expect(fleischnerRecommendation({ sizeMm: 10, multiple: false, risk: "high" }).guidelineId).toBe(
      "fleischner-2017",
    );
  });
});
