import { useCallback, useState } from "react";
import { queryRag } from "../utils/ragApi";
import type { RagSource } from "../types/chat";

type RagQueryStatus = "idle" | "loading" | "error" | "success";

interface RagAnswer {
  content: string;
  sources: RagSource[];
}

export function useRagQuery() {
  const [status, setStatus] = useState<RagQueryStatus>("idle");
  const [answer, setAnswer] = useState<RagAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (projectId: number, question: string) => {
    setStatus("loading");
    setError(null);
    try {
      const result = await queryRag(projectId, question);
      setAnswer({ content: result.answer, sources: result.sources });
      setStatus("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "일시적으로 답변을 생성할 수 없습니다");
      setStatus("error");
    }
  }, []);

  return { status, answer, error, ask };
}
