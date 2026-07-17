import type { MeetingAiResult, MeetingAiTodo } from "../types/meetingAiTypes";
import { apiFetch } from "../../../global/api/apiClient";

interface AnalyzeMeetingParams {
  projectId: string;
  file: File | null;
  title: string;
  meetingDate: string;
  meetingKind: string;
  sourceType: "document" | "audio" | "video";
  participants: string[];
}

export type MeetingAnalysisStatus = "PROCESSING" | "COMPLETED" | "FAILED";

export interface MeetingAnalysisResponse {
  meetingId: string;
  projectId: string;
  status: MeetingAnalysisStatus;
  sourceType: string;
  fileName: string | null;
  analysisSource: "FASTAPI" | "SPRING_FALLBACK" | null;
  analysis: MeetingAiResult | null;
  errorMessage: string | null;
}

export async function analyzeMeeting(params: AnalyzeMeetingParams): Promise<MeetingAnalysisResponse> {
  const formData = new FormData();
  if (params.file) formData.append("file", params.file);
  formData.append("title", params.title);
  formData.append("meetingDate", params.meetingDate);
  formData.append("meetingKind", params.meetingKind);
  formData.append("sourceType", params.sourceType);
  params.participants.forEach(participant => formData.append("participants", participant));

  return apiFetch<MeetingAnalysisResponse>(`/projects/${params.projectId}/meetings/analyze`, {
    method: "POST",
    body: formData,
  });
}

export async function fetchMeeting(projectId: string, meetingId: string): Promise<MeetingAnalysisResponse> {
  return apiFetch<MeetingAnalysisResponse>(`/projects/${projectId}/meetings/${meetingId}`);
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
