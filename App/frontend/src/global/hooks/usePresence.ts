import { useEffect, useState } from "react";
import { apiFetch } from "../api/apiClient";

export interface PresenceUser {
  userId: number;
  name: string;
  role: string;
}

const POLL_INTERVAL_MS = 20000;

/** 프로젝트 접속자 목록을 폴링한다. 접속자 표시는 부가 기능이므로 실패해도 조용히 무시한다. */
export function usePresence(projectId: number | null): PresenceUser[] {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!projectId || projectId < 0) {
      setUsers([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await apiFetch<PresenceUser[]>(`/projects/${projectId}/presence`);
        if (!cancelled) setUsers(result);
      } catch {
        // no-op: 접속자 목록 폴링 실패는 화면에 영향 없이 다음 폴링에서 재시도한다.
      }
    };
    void load();
    const intervalId = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [projectId]);

  return users;
}
