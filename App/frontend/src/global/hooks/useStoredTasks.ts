import { useEffect, useState } from "react";
import type { Task } from "../../board/libs/types/task";
import { getStoredTasks, TASKS_UPDATED_EVENT } from "../../board/libs/utils/localStore";

export function useStoredTasks(): Task[] {
  const [tasks, setTasks] = useState<Task[]>(getStoredTasks);

  useEffect(() => {
    const sync = () => setTasks(getStoredTasks());
    window.addEventListener(TASKS_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(TASKS_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return tasks;
}
