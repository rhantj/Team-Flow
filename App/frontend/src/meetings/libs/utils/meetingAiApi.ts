import type { MeetingAiResult, MeetingAiTodo } from "../types/meetingAiTypes";
import { apiFetch } from "../../../global/api/apiClient";

interface AnalyzeMeetingParams {
  projectId: string;
  file: File | null;
  title: string;
  meetingDate: string;
  meetingKind: string;
  sourceType: "document" | "audio";
  participants: string[];
  attendeeIds?: number[];
}

export type MeetingAnalysisStatus = "PROCESSING" | "COMPLETED" | "FAILED";

export interface AttendeeSummary {
  id: number;
  name: string | null;
  role: string | null;
}

export interface MeetingAnalysisResponse {
  meetingId: string;
  projectId: string;
  status: MeetingAnalysisStatus;
  sourceType: string;
  fileName: string | null;
  analysisSource: "FASTAPI" | "SPRING_FALLBACK" | null;
  analysis: MeetingAiResult | null;
  errorMessage: string | null;
  attendees: AttendeeSummary[];
}

export async function analyzeMeeting(params: AnalyzeMeetingParams): Promise<MeetingAnalysisResponse> {
  const formData = new FormData();
  if (params.file) formData.append("file", params.file);
  formData.append("title", params.title);
  formData.append("meetingDate", params.meetingDate);
  formData.append("meetingKind", params.meetingKind);
  formData.append("sourceType", params.sourceType);
  params.participants.forEach(participant => formData.append("participants", participant));
  (params.attendeeIds ?? []).forEach(attendeeId => formData.append("attendeeIds", String(attendeeId)));

  return apiFetch<MeetingAnalysisResponse>(`/projects/${params.projectId}/meetings/analyze`, {
    method: "POST",
    body: formData,
  });
}

export interface MeetingAttendanceSummaryDto {
  userId: number;
  name: string | null;
  meetingsAttended: number;
  totalMeetings: number;
  attendanceRate: number;
}

export async function fetchAttendanceSummary(projectId: string): Promise<MeetingAttendanceSummaryDto[]> {
  return apiFetch<MeetingAttendanceSummaryDto[]>(`/projects/${projectId}/meetings/attendance-summary`);
}

export async function fetchMeeting(projectId: string, meetingId: string): Promise<MeetingAnalysisResponse> {
  return apiFetch<MeetingAnalysisResponse>(`/projects/${projectId}/meetings/${meetingId}`);
}

export interface MeetingDeleteResponse {
  meetingId: string;
  status: "DELETED";
}

export async function deleteMeeting(projectId: string, meetingId: string, deleteLinkedTasks = false): Promise<MeetingDeleteResponse> {
  const query = new URLSearchParams({ deleteLinkedTasks: String(deleteLinkedTasks) });
  return apiFetch<MeetingDeleteResponse>(`/projects/${projectId}/meetings/${meetingId}?${query.toString()}`, {
    method: "DELETE",
  });
}

export async function retryMeetingAnalysis(projectId: string, meetingId: string): Promise<MeetingAnalysisResponse> {
  return apiFetch<MeetingAnalysisResponse>(`/projects/${projectId}/meetings/${meetingId}/retry`, {
    method: "POST",
  });
}

export interface MeetingSummaryDto {
  meetingId: string;
  title: string;
  meetingDate: string | null;
  meetingType: string | null;
  analysisStatus: string;
}

export async function fetchMeetings(projectId: string): Promise<MeetingSummaryDto[]> {
  return apiFetch<MeetingSummaryDto[]>(`/projects/${projectId}/meetings`);
}

export interface TaskRegisterResponseDto {
  meetingId: string;
  registeredCount: number;
  boardStatus: string;
}

export async function registerMeetingTasks(
  projectId: string,
  meetingId: string,
  todos: MeetingAiTodo[]
): Promise<TaskRegisterResponseDto> {
  return apiFetch<TaskRegisterResponseDto>(`/projects/${projectId}/meetings/${meetingId}/tasks/register`, {
    method: "POST",
    body: JSON.stringify({ todos }),
  });
}
