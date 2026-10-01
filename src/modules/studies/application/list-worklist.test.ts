import { describe, expect, it } from "vitest";
import type { WorklistItem } from "../domain/study";
import { InMemoryStudyRepository } from "./in-memory-study-repository";
import { listWorklist } from "./list-worklist";

const patient = {
  id: "10000000-0000-4000-8000-000000000001",
  mrn: "RP-100001",
  fullName: "Helen Carter",
  sex: "F" as const,
  birthDate: "1968-05-30",
};

function makeItem(overrides: Partial<WorklistItem>): WorklistItem {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    accession: "RP26000001",
    patientId: patient.id,
    modality: "CT",
    bodyPart: "chest",
    description: "CTA chest, pulmonary embolism protocol",
    indication: "Suspected pulmonary embolism.",
    priority: "routine",
    status: "unread",
    studyDate: "2026-10-01T11:35:00.000Z",
    dicomPath: null,
    assignedTo: null,
    patient,
    ...overrides,
  };
}

describe("listWorklist", () => {
  it("sorts STAT studies first, then by oldest study date", async () => {
    const routineOld = makeItem({
      id: "20000000-0000-4000-8000-000000000001",
      priority: "routine",
      studyDate: "2026-10-01T08:00:00.000Z",
    });
    const stat = makeItem({
      id: "20000000-0000-4000-8000-000000000002",
      priority: "stat",
      studyDate: "2026-10-01T11:00:00.000Z",
    });
    const urgent = makeItem({
      id: "20000000-0000-4000-8000-000000000003",
      priority: "urgent",
      studyDate: "2026-10-01T09:00:00.000Z",
    });
    const repo = new InMemoryStudyRepository([routineOld, stat, urgent]);

    const result = await listWorklist(repo);

    expect(result.map((item) => item.id)).toEqual([stat.id, urgent.id, routineOld.id]);
  });

  it("applies status, modality and assignedTo filters", async () => {
    const a = makeItem({ id: "20000000-0000-4000-8000-000000000001", status: "unread", modality: "CT" });
    const b = makeItem({
      id: "20000000-0000-4000-8000-000000000002",
      status: "in_progress",
      modality: "CR",
      assignedTo: "a0000000-0000-4000-8000-000000000001",
    });
    const repo = new InMemoryStudyRepository([a, b]);

    expect((await listWorklist(repo, { status: "unread" })).map((i) => i.id)).toEqual([a.id]);
    expect((await listWorklist(repo, { modality: "CR" })).map((i) => i.id)).toEqual([b.id]);
    expect(
      (await listWorklist(repo, { assignedTo: "a0000000-0000-4000-8000-000000000001" })).map((i) => i.id),
    ).toEqual([b.id]);
  });
});
