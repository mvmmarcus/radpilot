import { describe, expect, it } from "vitest";
import type { WorklistItem } from "../domain/study";
import { claimStudy } from "./claim-study";
import { InMemoryStudyRepository } from "./in-memory-study-repository";
import { releaseStudy } from "./release-study";

const patient = {
  id: "10000000-0000-4000-8000-000000000001",
  mrn: "RP-100001",
  fullName: "Helen Carter",
  sex: "F" as const,
  birthDate: "1968-05-30",
};

const USER_A = "a0000000-0000-4000-8000-000000000001";
const USER_B = "a0000000-0000-4000-8000-000000000002";

function makeItem(overrides: Partial<WorklistItem>): WorklistItem {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    accession: "RP26000001",
    patientId: patient.id,
    modality: "CT",
    bodyPart: "chest",
    description: "CTA chest, pulmonary embolism protocol",
    indication: "Suspected pulmonary embolism.",
    priority: "stat",
    status: "unread",
    studyDate: "2026-10-01T11:35:00.000Z",
    dicomPath: null,
    assignedTo: null,
    patient,
    ...overrides,
  };
}

describe("claimStudy", () => {
  it("claims an unassigned study", async () => {
    const item = makeItem({ assignedTo: null });
    const repo = new InMemoryStudyRepository([item]);

    const result = await claimStudy(repo, item.id, USER_A);

    expect(result).toEqual({ ok: true, item: { ...item, assignedTo: USER_A } });
  });

  it("fails to claim a study already assigned to someone else", async () => {
    const item = makeItem({ assignedTo: USER_B });
    const repo = new InMemoryStudyRepository([item]);

    const result = await claimStudy(repo, item.id, USER_A);

    expect(result).toEqual({ ok: false, reason: "not_found_or_already_claimed" });
  });

  it("fails to claim a study that does not exist", async () => {
    const repo = new InMemoryStudyRepository([]);

    const result = await claimStudy(repo, "20000000-0000-4000-8000-000000000099", USER_A);

    expect(result).toEqual({ ok: false, reason: "not_found_or_already_claimed" });
  });
});

describe("releaseStudy", () => {
  it("releases a study you hold", async () => {
    const item = makeItem({ assignedTo: USER_A });
    const repo = new InMemoryStudyRepository([item]);

    const result = await releaseStudy(repo, item.id, USER_A);

    expect(result).toEqual({ ok: true, item: { ...item, assignedTo: null } });
  });

  it("fails to release a study held by someone else", async () => {
    const item = makeItem({ assignedTo: USER_B });
    const repo = new InMemoryStudyRepository([item]);

    const result = await releaseStudy(repo, item.id, USER_A);

    expect(result).toEqual({ ok: false, reason: "not_found_or_not_yours" });
  });
});
