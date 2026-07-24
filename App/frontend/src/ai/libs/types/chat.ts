export interface RagSource {
  // 백엔드(FastAPI RagSource)는 action_item도 반환한다. 여기서 빠뜨리면 타입 가드가
  // 해당 출처를 거부해 저장된 대화 세션이 통째로 폐기된다.
  sourceType: "meeting" | "task" | "action_item";
  sourceId: number;
  contentSnippet: string;
  similarity: number;
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  sources?: RagSource[];
}
