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

interface MeetingAnalysisResponse {
  meetingId: string;
  projectId: string;
  status: string;
  sourceType: string;
  fileName: string | null;
  analysisSource: "FASTAPI" | "SPRING_FALLBACK";
  analysis: MeetingAiResult;
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

  if (!response.ok) {
    throw new Error(`Meeting analysis failed: ${response.status}`);
  }

  const body = await response.json() as ApiEnvelope<MeetingAnalysisResponse>;
  if (!body.success) {
    throw new Error(body.error?.message ?? "Meeting analysis failed");
  }
  return body.data;
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
  if (!response.ok) {
    throw new Error(`Meeting list fetch failed: ${response.status}`);
  }
  const body = await response.json() as ApiEnvelope<MeetingSummaryDto[]>;
  if (!body.success) {
    throw new Error(body.error?.message ?? "Meeting list fetch failed");
  }
  return body.data;
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
  if (!response.ok) {
    throw new Error(`Task register failed: ${response.status}`);
  }
  const body = await response.json() as ApiEnvelope<TaskRegisterResponseDto>;
  if (!body.success) {
    throw new Error(body.error?.message ?? "Task register failed");
  }
  return body.data;
}
