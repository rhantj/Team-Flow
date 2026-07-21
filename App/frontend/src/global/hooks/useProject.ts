import { useEffect, useState } from "react";
import { getProject, type ProjectResponse } from "../api/projectsApi";

/** 현재 프로젝트의 실제 상세 정보(마감일/진행률/인원수 등)를 가져온다. */
export function useProject(projectId: number | null): ProjectResponse | null {
  const [project, setProject] = useState<ProjectResponse | null>(null);

  useEffect(() => {
    if (!projectId || projectId < 0) {
      setProject(null);
      return;
    }
    let cancelled = false;
    getProject(projectId)
      .then((result) => { if (!cancelled) setProject(result); })
      .catch(() => { if (!cancelled) setProject(null); });
    return () => { cancelled = true; };
  }, [projectId]);

  return project;
}
