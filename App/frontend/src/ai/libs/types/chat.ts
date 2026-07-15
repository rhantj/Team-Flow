export interface RagSource {
  sourceType: "meeting" | "task";
  sourceId: number;
  contentSnippet: string;
  similarity: number;
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  sources?: RagSource[];
}
