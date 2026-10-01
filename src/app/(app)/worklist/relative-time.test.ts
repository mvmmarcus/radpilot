import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

describe("relativeTime", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");

  it("formats a few minutes ago", () => {
    expect(relativeTime("2026-10-01T11:45:00.000Z", now)).toBe("15 minutes ago");
  });

  it("formats just now for sub-minute differences", () => {
    expect(relativeTime("2026-10-01T11:59:40.000Z", now)).toBe("just now");
  });

  it("formats hours ago", () => {
    expect(relativeTime("2026-10-01T09:00:00.000Z", now)).toBe("3 hours ago");
  });

  it("formats days ago", () => {
    expect(relativeTime("2026-09-28T12:00:00.000Z", now)).toBe("3 days ago");
  });
});
