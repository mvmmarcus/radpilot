import { describe, expect, it } from "vitest";
import { AI_QUOTA, checkAiQuota, type GenerationCounter } from "./quota";

function counter(mine: number, everyone: number): GenerationCounter {
  return { countSince: async (_since, createdBy) => (createdBy ? mine : everyone) };
}

describe("checkAiQuota", () => {
  it("allows a call under both limits", async () => {
    expect(await checkAiQuota(counter(0, 0), "user-1")).toEqual({ ok: true });
    expect(await checkAiQuota(counter(AI_QUOTA.perUserPerHour - 1, AI_QUOTA.globalPerDay - 1), "user-1")).toEqual({ ok: true });
  });

  it("refuses once the user's hourly limit is reached", async () => {
    const result = await checkAiQuota(counter(AI_QUOTA.perUserPerHour, 0), "user-1");
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/per hour/) });
  });

  it("refuses once the global daily cap is reached", async () => {
    const result = await checkAiQuota(counter(0, AI_QUOTA.globalPerDay), "user-1");
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/daily/) });
  });

  it("counts the user over the last hour and everyone over the last day", async () => {
    const calls: { since: Date; createdBy?: string }[] = [];
    const now = new Date("2026-10-01T12:00:00Z");
    await checkAiQuota({ countSince: async (since, createdBy) => (calls.push({ since, createdBy }), 0) }, "user-1", now);
    expect(calls).toEqual([
      { since: new Date("2026-10-01T11:00:00Z"), createdBy: "user-1" },
      { since: new Date("2026-09-30T12:00:00Z"), createdBy: undefined },
    ]);
  });
});
