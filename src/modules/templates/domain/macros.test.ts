import { describe, expect, it } from "vitest";
import type { Template } from "./template";
import { expandMacroAtCaret } from "./macros";

const template: Pick<Template, "macros"> = {
  macros: [
    { trigger: ".nopte", label: "No PE", section: "impression", text: "No pulmonary embolism." },
    { trigger: ".nodule", label: "Nodule", section: "findings", text: "Solid nodule in the ___ lobe." },
  ],
};

describe("expandMacroAtCaret", () => {
  it("expands a trigger typed at the caret in its target section", () => {
    const text = "1. .nopte";
    const caret = text.length;
    const result = expandMacroAtCaret(template, "impression", text, caret);
    expect(result?.text).toBe("1. No pulmonary embolism.");
    expect(result?.caret).toBe("1. No pulmonary embolism.".length);
  });

  it("expands mid-text, preserving what follows", () => {
    const text = ".nodule and no effusion";
    const result = expandMacroAtCaret(template, "findings", text, ".nodule".length);
    expect(result?.text).toBe("Solid nodule in the ___ lobe. and no effusion");
  });

  it("returns null when the trigger belongs to a different section", () => {
    const text = ".nopte";
    const result = expandMacroAtCaret(template, "findings", text, text.length);
    expect(result).toBeNull();
  });

  it("returns null when there is no matching macro", () => {
    const text = ".unknown";
    const result = expandMacroAtCaret(template, "findings", text, text.length);
    expect(result).toBeNull();
  });

  it("returns null mid-word (not yet a complete trigger boundary issue aside)", () => {
    const text = ".nopt";
    const result = expandMacroAtCaret(template, "impression", text, text.length);
    expect(result).toBeNull();
  });
});
