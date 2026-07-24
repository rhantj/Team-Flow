import type { RagSource } from "../types/chat";
import type { ActionCard, AssistantResult } from "../types/command";
import { apiFetch } from "../../../global/api/apiClient";

// 재작성 프롬프트에 실리는 대화 기록 상한. Spring AssistantController의 값과 같아야
// 프론트에서 자른 크기가 서버 검증(초과 시 400 INVALID_HISTORY)에 걸리지 않는다.
export const MAX_HISTORY_MESSAGES = 6;
export const MAX_HISTORY_CONTENT_LENGTH = 1000;

export interface AssistantHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface RawRagSource {
  source_type: "meeting" | "task" | "action_item";
  source_id: number;
  content_snippet: string;
  similarity: number;
}

interface RawActionCard {
  step_id: string;
  tool: string;
  task_id: number | null;
  title: string;
  summary: string;
  args: Record<string, unknown>;
}

interface RawAssistantResponse {
  type: "answer" | "confirm" | "done";
  message: string;
  sources: RawRagSource[];
  thread_id: string | null;
  card: RawActionCard | null;
}

function toSource(raw: RawRagSource): RagSource {
  return {
    sourceType: raw.source_type,
    sourceId: raw.source_id,
    contentSnippet: raw.content_snippet,
    similarity: raw.similarity,
  };
}

function toCard(raw: RawActionCard | null): ActionCard | null {
  if (!raw) return null;
  return {
    stepId: raw.step_id,
    tool: raw.tool,
    taskId: raw.task_id,
    title: raw.title,
    summary: raw.summary,
    args: raw.args,
  };
}

function toResult(raw: RawAssistantResponse): AssistantResult {
  return {
    type: raw.type,
    content: raw.message,
    sources: (raw.sources ?? []).map(toSource),
    threadId: raw.thread_id ?? null,
    card: toCard(raw.card ?? null),
  };
}

export function trimHistory(
  history: readonly AssistantHistoryMessage[]
): AssistantHistoryMessage[] {
  return history
    .slice(-MAX_HISTORY_MESSAGES)
    .map(({ role, content }) => ({ role, content: content.slice(0, MAX_HISTORY_CONTENT_LENGTH) }));
}

export async function sendCommand(
  projectId: number,
  question: string,
  history: readonly AssistantHistoryMessage[] = [],
  signal?: AbortSignal
): Promise<AssistantResult> {
  const data = await apiFetch<RawAssistantResponse>("/ai/assistant/command", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, question, history: trimHistory(history) }),
    signal,
  });
  return toResult(data);
}
