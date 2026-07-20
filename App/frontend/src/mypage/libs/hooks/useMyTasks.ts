import { useCallback, useEffect, useState } from "react";
import { fetchTasks } from "../../../board/libs/utils/taskApi";
import type { Task } from "../../../board/libs/types/task";

export type MyTasksLoadState = "loading" | "ready" | "error";

export function useMyTasks(projectId: number | null, userId: number | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadState, setLoadState] = useState<MyTasksLoadState>("loading");

  const load = useCallback(() => {
    if (projectId === null || userId === null) {
      setTasks([]);
      setLoadState("ready");
      return;
    }
    setLoadState("loading");
    fetchTasks(projectId)
      .then((all) => {
        setTasks(all.filter((task) => task.assignee === String(userId)));
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, [projectId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { tasks, loadState, reload: load };
}
