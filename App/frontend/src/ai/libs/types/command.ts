import type { RagSource } from "./chat";

/** 실행 승인을 받기 위해 서버가 내려주는 확인 카드. */
export interface ActionCard {
  stepId: string;
  tool: string;
  taskId: number | null;
  title: string;
  summary: string;
  args: Record<string, unknown>;
}

export interface AssistantResult {
  type: "answer" | "confirm" | "done";
  content: string;
  sources: RagSource[];
  threadId: string | null;
  card: ActionCard | null;
}
