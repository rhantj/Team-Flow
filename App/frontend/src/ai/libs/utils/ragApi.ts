import type { RagSource } from "../types/chat";
import { tokenStore } from "../../../global/api/tokenStore";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1").replace(/\/v1$/, "");

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string } | null;
}

// Spring 응답은 FastAPI 스키마를 그대로 통과시키므로 snake_case로 온다 (source_type 등).
interface RawRagSource {
  source_type: "meeting" | "task";
  source_id: number;
  content_snippet: string;
  similarity: number;
}

interface RawRagQueryResult {
  answer: string;
  sources: RawRagSource[];
}

interface RagQueryResult {
  answer: string;
  sources: RagSource[];
}

export async function queryRag(projectId: number, question: string): Promise<RagQueryResult> {
  const accessToken = tokenStore.getAccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${API_BASE_URL}/ai/rag/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({ project_id: projectId, question }),
  });

  const body = (await response.json()) as ApiEnvelope<RawRagQueryResult>;
  if (!response.ok || !body.success || !body.data) {
    throw new Error(body.error?.message ?? "RAG 질의에 실패했습니다");
  }
  return {
    answer: body.data.answer,
    sources: body.data.sources.map(s => ({
      sourceType: s.source_type,
      sourceId: s.source_id,
      contentSnippet: s.content_snippet,
      similarity: s.similarity,
    })),
  };
}
