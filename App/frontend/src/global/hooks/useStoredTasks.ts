import { useEffect, useState } from "react";
import type { Task } from "../../board/libs/types/task";
import { fetchTasks } from "../../board/libs/utils/taskApi";

// 대시보드 등 읽기 전용 화면에서 쓰는 훅. 마운트 시(=페이지 이동/새로고침 시) 한 번만 조회한다.
// 실시간 동기화는 하지 않으므로 다른 팀원의 변경사항은 다시 이 화면에 들어와야 보인다.
// 업무를 직접 생성/변경하는 BoardView는 이 훅 대신 taskApi를 직접 호출해 낙관적 업데이트와 에러 처리를 한다.
export function useStoredTasks(): Task[] {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchTasks()
      .then((result) => {
        if (!cancelled) setTasks(result);
      })
      .catch((error) => {
        console.error("업무 목록을 불러오지 못했습니다.", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return tasks;
}
