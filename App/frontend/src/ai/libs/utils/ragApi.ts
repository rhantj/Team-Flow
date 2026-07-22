import type { RagSource } from "../types/chat";
import { apiFetch } from "../../../global/api/apiClient";

// Spring 응답은 FastAPI 스키마를 그대로 통과시키므로 snake_case로 온다 (source_type 등).
interface RawRagSource {
  source_type: "meeting" | "task" | "action_item";
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

export async function queryRag(projectId: number, question: string, signal?: AbortSignal): Promise<RagQueryResult> {
  const data = await apiFetch<RawRagQueryResult>("/ai/rag/query", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, question }),
    signal,
  });
  return {
    answer: data.answer,
    sources: data.sources.map(s => ({
      sourceType: s.source_type,
      sourceId: s.source_id,
      contentSnippet: s.content_snippet,
      similarity: s.similarity,
    })),
  };
}
