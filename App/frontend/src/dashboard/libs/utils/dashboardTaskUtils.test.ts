import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { daysSince, formatDashboardDueDate, formatRelativeDate } from "./dashboardTaskUtils";

describe("formatDashboardDueDate", () => {
  it("formats a date-only string as MM.DD", () => {
    expect(formatDashboardDueDate("2026-07-21")).toBe("07.21");
  });

  it("formats a full ISO datetime string as MM.DD", () => {
    expect(formatDashboardDueDate("2026-07-21T09:30:00")).toBe("07.21");
  });

  it("returns 미정 when null", () => {
    expect(formatDashboardDueDate(null)).toBe("미정");
  });
});

describe("daysSince / formatRelativeDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("daysSince returns 0 for a timestamp earlier today", () => {
    expect(daysSince("2026-07-21T08:00:00")).toBe(0);
  });

  it("daysSince returns elapsed whole days for an earlier timestamp", () => {
    expect(daysSince("2026-07-18T12:00:00")).toBe(3);
  });

  it("daysSince returns null when given null", () => {
    expect(daysSince(null)).toBeNull();
  });

  it("formatRelativeDate returns 오늘 for today", () => {
    expect(formatRelativeDate("2026-07-21T08:00:00")).toBe("오늘");
  });

  it("formatRelativeDate returns 어제 for the previous calendar day", () => {
    expect(formatRelativeDate("2026-07-20T23:50:00")).toBe("어제");
  });

  it("formatRelativeDate returns n일 전 for 2~29 days ago", () => {
    expect(formatRelativeDate("2026-07-15T12:00:00")).toBe("6일 전");
  });

  it("formatRelativeDate falls back to MM.DD for 30+ days ago", () => {
    expect(formatRelativeDate("2026-06-01T12:00:00")).toBe("06.01");
  });

  it("formatRelativeDate returns 미정 when null", () => {
    expect(formatRelativeDate(null)).toBe("미정");
  });
});
