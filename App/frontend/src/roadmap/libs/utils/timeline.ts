import {
  addMonths,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ko } from "date-fns/locale";
import type { RoadmapResponse, RoadmapZoom } from "../types/roadmap";

export interface TimelineRange {
  start: Date;
  end: Date;
  totalDays: number;
}

export interface TimelineSegment {
  key: string;
  label: string;
  left: number;
  width: number;
}

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

function diffDays(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

export function resolveTimelineRange(roadmap: RoadmapResponse): TimelineRange {
  const projectStart = safeDate(roadmap.project.startDate);
  const projectEnd = safeDate(roadmap.project.deadline);
  if (projectStart && projectEnd && projectStart <= projectEnd) {
    return { start: projectStart, end: projectEnd, totalDays: diffDays(projectStart, projectEnd) };
  }

  const today = new Date();
  const start = projectStart
    ?? (projectEnd ? startOfMonth(subMonths(projectEnd, 2)) : startOfMonth(today));
  const end = projectEnd
    ?? (projectStart ? endOfMonth(addMonths(projectStart, 2)) : endOfMonth(addMonths(today, 2)));
  return { start, end, totalDays: diffDays(start, end) };
}

export function isDateWithinRange(value: string | null | undefined, range: TimelineRange): boolean {
  const date = safeDate(value);
  return date !== null && date >= range.start && date <= range.end;
}

export function intervalOverlapsRange(
  startDate: string | null | undefined,
  dueDate: string | null | undefined,
  range: TimelineRange,
): boolean {
  const parsedStart = safeDate(startDate ?? dueDate);
  const parsedEnd = safeDate(dueDate ?? startDate);
  if (!parsedStart || !parsedEnd) return false;
  const intervalStart = parsedStart <= parsedEnd ? parsedStart : parsedEnd;
  const intervalEnd = parsedStart <= parsedEnd ? parsedEnd : parsedStart;
  return intervalEnd >= range.start && intervalStart <= range.end;
}

export function positionPercent(value: string | null | undefined, range: TimelineRange): number | null {
  const date = safeDate(value);
  if (!date) return null;
  const days = (date.getTime() - range.start.getTime()) / 86_400_000;
  return Math.min(100, Math.max(0, (days / range.totalDays) * 100));
}

export function barStyle(
  startDate: string | null | undefined,
  dueDate: string | null | undefined,
  range: TimelineRange,
): { left: string; width: string } | null {
  const start = positionPercent(startDate ?? dueDate, range);
  const end = positionPercent(dueDate ?? startDate, range);
  if (start === null || end === null) return null;
  const left = Math.min(start, end);
  const width = Math.max(1.5, Math.abs(end - start) + 100 / range.totalDays);
  return { left: `${left}%`, width: `${Math.min(100 - left, width)}%` };
}

export function timelineSegments(range: TimelineRange, zoom: RoadmapZoom): TimelineSegment[] {
  const starts = zoom === "month"
    ? eachMonthOfInterval({ start: range.start, end: range.end })
    : eachWeekOfInterval({ start: range.start, end: range.end }, { weekStartsOn: 1 });
  return starts.map((segmentStart, index) => {
    const naturalStart = zoom === "month" ? startOfMonth(segmentStart) : startOfWeek(segmentStart, { weekStartsOn: 1 });
    const naturalEnd = zoom === "month" ? endOfMonth(segmentStart) : endOfWeek(segmentStart, { weekStartsOn: 1 });
    const visibleStart = naturalStart < range.start ? range.start : naturalStart;
    const visibleEnd = naturalEnd > range.end ? range.end : naturalEnd;
    const left = ((visibleStart.getTime() - range.start.getTime()) / 86_400_000 / range.totalDays) * 100;
    const width = (diffDays(visibleStart, visibleEnd) / range.totalDays) * 100;
    return {
      key: segmentStart.toISOString(),
      label: zoom === "month" ? format(segmentStart, "M월", { locale: ko }) : `${index + 1}주차`,
      left,
      width,
    };
  });
}
