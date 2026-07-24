import { describe, expect, it } from "vitest";
import { addMonths, format } from "date-fns";
import type { RoadmapResponse } from "../types/roadmap";
import {
  barStyle,
  intervalOverlapsRange,
  isDateWithinRange,
  positionPercent,
  resolveTimelineRange,
  timelineSegments,
} from "./timeline";

const roadmap: RoadmapResponse = {
  project: { id: "1", title: "테스트", startDate: "2026-07-01", deadline: "2026-07-31" },
  milestones: [],
  unassignedTasks: [],
};

describe("roadmap timeline", () => {
  it("uses project dates as the visible range", () => {
    const range = resolveTimelineRange({
      ...roadmap,
      project: { ...roadmap.project, startDate: "2026-07-10", deadline: "2026-08-20" },
      milestones: [{
        id: "2", title: "legacy", startDate: "2026-06-01", dueDate: "2026-09-01",
        taskCount: 0, doneCount: 0, progressPercent: 0, tasks: [],
      }],
    });
    expect(format(range.start, "yyyy-MM-dd")).toBe("2026-07-10");
    expect(format(range.end, "yyyy-MM-dd")).toBe("2026-08-20");
  });

  it("uses a current three-month preview when project dates are missing", () => {
    const range = resolveTimelineRange({
      ...roadmap,
      project: { ...roadmap.project, startDate: null, deadline: null },
      unassignedTasks: [{
        id: "99", milestoneId: null, title: "legacy", category: "other", status: "todo",
        assigneeId: null, assigneeName: null, startDate: null, dueDate: "2025-12-28",
        priority: "medium", position: 0,
      }],
    });
    const today = new Date();

    expect(format(range.start, "yyyy-MM")).toBe(format(today, "yyyy-MM"));
    expect(format(range.end, "yyyy-MM")).toBe(format(addMonths(today, 2), "yyyy-MM"));
  });

  it("places the start at zero percent", () => {
    expect(positionPercent("2026-07-01", resolveTimelineRange(roadmap))).toBe(0);
  });

  it("gives same-day work a visible minimum width", () => {
    const style = barStyle("2026-07-10", "2026-07-10", resolveTimelineRange(roadmap));
    expect(Number.parseFloat(style?.width ?? "0")).toBeGreaterThanOrEqual(1.5);
  });

  it("positions a real task interval relative to the exact project dates", () => {
    const range = resolveTimelineRange({
      ...roadmap,
      project: { ...roadmap.project, startDate: "2026-07-10", deadline: "2026-07-19" },
    });
    const style = barStyle("2026-07-12", "2026-07-14", range);
    expect(Number.parseFloat(style?.left ?? "0")).toBeCloseTo(20);
    expect(Number.parseFloat(style?.width ?? "0")).toBeCloseTo(30);
  });

  it("detects whether today marker belongs inside the visible project range", () => {
    const range = resolveTimelineRange(roadmap);
    expect(isDateWithinRange("2026-07-15", range)).toBe(true);
    expect(isDateWithinRange("2026-08-01", range)).toBe(false);
  });

  it("detects whether a task interval overlaps the visible range", () => {
    const range = resolveTimelineRange(roadmap);

    expect(intervalOverlapsRange("2026-06-28", "2026-07-02", range)).toBe(true);
    expect(intervalOverlapsRange(null, "2026-07-15", range)).toBe(true);
    expect(intervalOverlapsRange("2026-08-01", "2026-08-03", range)).toBe(false);
  });

  it("labels weekly segments as project-relative week numbers", () => {
    const range = resolveTimelineRange({
      ...roadmap,
      project: { ...roadmap.project, startDate: "2026-07-22", deadline: "2026-08-05" },
    });

    expect(timelineSegments(range, "week").map((segment) => segment.label)).toEqual([
      "1주차",
      "2주차",
      "3주차",
    ]);
  });
});
