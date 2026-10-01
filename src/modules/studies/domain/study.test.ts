import { describe, expect, it } from "vitest";
import { ageInYears, ageSexLabel, compareWorklistOrder, StudySchema } from "./study";

describe("compareWorklistOrder", () => {
  it("puts STAT before urgent before routine, then oldest first", () => {
    const items = [
      { id: "routine-old", priority: "routine" as const, studyDate: "2026-09-29T08:00:00Z" },
      { id: "stat-new", priority: "stat" as const, studyDate: "2026-09-30T10:00:00Z" },
      { id: "urgent", priority: "urgent" as const, studyDate: "2026-09-30T09:00:00Z" },
      { id: "stat-old", priority: "stat" as const, studyDate: "2026-09-30T07:00:00Z" },
    ];
    expect(items.sort(compareWorklistOrder).map((i) => i.id)).toEqual([
      "stat-old",
      "stat-new",
      "urgent",
      "routine-old",
    ]);
  });
});

describe("ageInYears", () => {
  it("counts whole years and handles the day before a birthday", () => {
    expect(ageInYears("1968-10-01", new Date("2026-09-30T12:00:00Z"))).toBe(57);
    expect(ageInYears("1968-10-01", new Date("2026-10-01T12:00:00Z"))).toBe(58);
  });

  it("formats an age/sex label", () => {
    expect(ageSexLabel({ birthDate: "1968-03-14", sex: "F" }, new Date("2026-09-30T00:00:00Z"))).toBe("58F");
  });
});

describe("StudySchema", () => {
  it("accepts a Postgres timestamptz string and a null dicom path", () => {
    const parsed = StudySchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      accession: "RP-0001",
      patientId: "00000000-0000-4000-8000-000000000002",
      modality: "CT",
      bodyPart: "chest",
      description: "CT angiography chest",
      indication: "Suspected PE",
      priority: "stat",
      status: "unread",
      studyDate: "2026-09-30T09:15:00+00:00",
      dicomPath: null,
      assignedTo: null,
    });
    expect(parsed.modality).toBe("CT");
  });
});
