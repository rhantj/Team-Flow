import { beforeEach, describe, expect, it } from "vitest";

import {
  getSavedMeetings,
  getStoredMeetings,
  MEETING_STORAGE_KEY,
  saveSavedMeetings,
  saveStoredMeetings,
  SAVED_MEETING_STORAGE_KEY,
} from "./localStore";
import type { Meeting, SavedMeetingRecord } from "../../../meetings/libs/types/meeting";

const meetingA: Meeting = {
  id: "meeting-a",
  title: "A 프로젝트 회의",
  date: "2026-07-19",
  duration: "30분",
  status: "processed",
};

const meetingB: Meeting = {
  id: "meeting-b",
  title: "B 프로젝트 회의",
  date: "2026-07-19",
  duration: "45분",
  status: "processing",
};

const savedMeetingA: SavedMeetingRecord = {
  meetingId: "saved-a",
  title: "A 프로젝트 저장 회의",
  meetingDate: "2026-07-19",
  meetingKind: "정기회의",
  participants: ["김민준"],
  originalFileName: "a.txt",
  fileType: "document",
  summary: "A 프로젝트 요약",
  decisions: [],
  risks: [],
  actionItems: [],
  createdAt: "2026-07-19T00:00:00.000Z",
  source: "MEETING_AI",
};

const savedMeetingB: SavedMeetingRecord = {
  ...savedMeetingA,
  meetingId: "saved-b",
  title: "B 프로젝트 저장 회의",
  originalFileName: "b.txt",
  summary: "B 프로젝트 요약",
};

describe("localStore project scoping", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps meeting lists separated by project id", () => {
    saveStoredMeetings([meetingA], "project-a");
    saveStoredMeetings([meetingB], "project-b");

    expect(getStoredMeetings("project-a")).toEqual([meetingA]);
    expect(getStoredMeetings("project-b")).toEqual([meetingB]);
    expect(window.localStorage.getItem(`${MEETING_STORAGE_KEY}.project-a`)).toContain("meeting-a");
    expect(window.localStorage.getItem(`${MEETING_STORAGE_KEY}.project-b`)).toContain("meeting-b");
  });

  it("does not mix scoped meetings with legacy unscoped meetings", () => {
    window.localStorage.setItem(MEETING_STORAGE_KEY, JSON.stringify([meetingA]));

    expect(getStoredMeetings("project-b")).toEqual([]);
  });

  it("keeps saved analysis results separated by project id", () => {
    saveSavedMeetings([savedMeetingA], "project-a");
    saveSavedMeetings([savedMeetingB], "project-b");

    expect(getSavedMeetings("project-a")).toEqual([savedMeetingA]);
    expect(getSavedMeetings("project-b")).toEqual([savedMeetingB]);
    expect(window.localStorage.getItem(`${SAVED_MEETING_STORAGE_KEY}.project-a`)).toContain("saved-a");
    expect(window.localStorage.getItem(`${SAVED_MEETING_STORAGE_KEY}.project-b`)).toContain("saved-b");
  });
});
