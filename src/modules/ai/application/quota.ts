/**
 * Spend guard for the public demo: every model call is a row in
 * ai_generations, so counting recent rows bounds what a visitor (or a script
 * holding the shared demo login) can cost. Not applied to the mock provider.
 */
export const AI_QUOTA = {
  /** Calls one user may make per rolling hour. */
  perUserPerHour: 30,
  /** Calls all users together may make per rolling 24 hours. */
  globalPerDay: 300,
} as const;

/** Port over ai_generations: how many calls were logged since `since`, optionally by one user. */
export interface GenerationCounter {
  countSince(since: Date, createdBy?: string): Promise<number>;
}

export type AiQuotaResult = { ok: true } | { ok: false; message: string };

const HOUR_MS = 60 * 60 * 1000;

export async function checkAiQuota(
  counter: GenerationCounter,
  userId: string,
  now: Date = new Date(),
): Promise<AiQuotaResult> {
  const [mine, everyone] = await Promise.all([
    counter.countSince(new Date(now.getTime() - HOUR_MS), userId),
    counter.countSince(new Date(now.getTime() - 24 * HOUR_MS)),
  ]);

  if (mine >= AI_QUOTA.perUserPerHour) {
    return { ok: false, message: `AI limit reached: ${AI_QUOTA.perUserPerHour} calls per hour. Try again later.` };
  }
  if (everyone >= AI_QUOTA.globalPerDay) {
    return { ok: false, message: "The demo's daily AI budget is used up. Try again tomorrow." };
  }
  return { ok: true };
}
