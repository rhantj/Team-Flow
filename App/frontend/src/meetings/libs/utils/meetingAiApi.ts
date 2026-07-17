import type { MeetingAiResult, MeetingAiTodo } from "../types/meetingAiTypes";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

interface AnalyzeMeetingParams {
  projectId: string;
  file: File | null;
  title: string;
  meetingDate: string;
  meetingKind: string;
  sourceType: "document" | "audio" | "video";
  participants: string[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string } | null;
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

async function unwrapEnvelope<T>(response: Response, failureMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${failureMessage}: ${response.status}`);
  }
  const body = await response.json() as ApiEnvelope<T>;
  if (!body.success) {
    throw new Error(body.error?.message ?? failureMessage);
  }
  return body.data;
}

export async function analyzeMeeting(params: AnalyzeMeetingParams): Promise<MeetingAnalysisResponse> {
  const formData = new FormData();
  if (params.file) formData.append("file", params.file);
  formData.append("title", params.title);
  formData.append("meetingDate", params.meetingDate);
  formData.append("meetingKind", params.meetingKind);
  formData.append("sourceType", params.sourceType);
  params.participants.forEach(participant => formData.append("participants", participant));

  const response = await fetch(`${API_BASE_URL}/projects/${params.projectId}/meetings/analyze`, {
    method: "POST",
    body: formData,
  });
  return unwrapEnvelope<MeetingAnalysisResponse>(response, "Meeting analysis failed");
}

export async function fetchMeeting(projectId: string, meetingId: string): Promise<MeetingAnalysisResponse> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/meetings/${meetingId}`);
  return unwrapEnvelope<MeetingAnalysisResponse>(response, "Meeting fetch failed");
}

export async function retryMeetingAnalysis(projectId: string, meetingId: string): Promise<MeetingAnalysisResponse> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/meetings/${meetingId}/retry`, {
    method: "POST",
  });
  return unwrapEnvelope<MeetingAnalysisResponse>(response, "Meeting retry failed");
}

export interface MeetingSummaryDto {
  meetingId: string;
  title: string;
  meetingDate: string | null;
  meetingType: string | null;
  analysisStatus: string;
}

export async function fetchMeetings(projectId: string): Promise<MeetingSummaryDto[]> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/meetings`);
  return unwrapEnvelope<MeetingSummaryDto[]>(response, "Meeting list fetch failed");
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
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/meetings/${meetingId}/tasks/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ todos }),
  });
  return unwrapEnvelope<TaskRegisterResponseDto>(response, "Task register failed");
}
