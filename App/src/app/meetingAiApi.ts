import type { MeetingAiResult } from "./meetingAiTypes";

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
