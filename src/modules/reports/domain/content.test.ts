import { describe, expect, it } from "vitest";
import { combineGeneratedText } from "./content";

describe("combineGeneratedText", () => {
  it("uses the draft when the section was empty", () => {
    expect(combineGeneratedText("findings", "8 mm nodule.", undefined)).toBe("8 mm nodule.");
    expect(combineGeneratedText("technique", "CT chest.", "  ")).toBe("CT chest.");
  });

  it("keeps existing text after the draft", () => {
    expect(combineGeneratedText("findings", "8 mm nodule.", "23 mm, series 1 image 13")).toBe(
      "8 mm nodule.\n23 mm, series 1 image 13",
    );
  });

  it("does not repeat existing text the draft already contains", () => {
    expect(combineGeneratedText("findings", "8 mm nodule.\n23 mm, series 1 image 13", "23 mm, series 1 image 13")).toBe(
      "8 mm nodule.\n23 mm, series 1 image 13",
    );
  });

  it("leaves an existing Technique alone", () => {
    expect(combineGeneratedText("technique", "CT chest per protocol.", "Helical CT with 75 mL contrast.")).toBeNull();
  });
});
