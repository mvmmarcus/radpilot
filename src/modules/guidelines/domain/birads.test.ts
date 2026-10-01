import { describe, expect, it } from "vitest";
import { biradsManagement } from "./birads";

describe("BI-RADS management", () => {
  it("maps every category to its label and management text", () => {
    expect(biradsManagement(0)).toEqual({
      category: 0,
      label: "BI-RADS 0: Incomplete",
      managementText: "Additional imaging evaluation and/or comparison to prior studies is needed.",
    });
    expect(biradsManagement(1).managementText).toMatch(/Routine screening/);
    expect(biradsManagement(2).managementText).toMatch(/Routine screening/);
    expect(biradsManagement(3).managementText).toBe("Short-interval follow-up imaging at 6 months.");
    expect(biradsManagement(4).managementText).toMatch(/biopsy/i);
    expect(biradsManagement(5).managementText).toMatch(/Biopsy/);
    expect(biradsManagement(6).managementText).toMatch(/oncologic/);
  });
});
