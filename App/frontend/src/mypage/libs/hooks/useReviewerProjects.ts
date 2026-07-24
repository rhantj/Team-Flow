import { useCallback, useEffect, useState } from "react";
import { fetchReviewerProjects } from "../utils/reviewerApi";
import type { ReviewerProject } from "../utils/reviewerApi";

export type ReviewerProjectsLoadState = "loading" | "ready" | "error";

export function useReviewerProjects() {
  const [projects, setProjects] = useState<ReviewerProject[]>([]);
  const [loadState, setLoadState] = useState<ReviewerProjectsLoadState>("loading");

  const load = useCallback(() => {
    setLoadState("loading");
    fetchReviewerProjects()
      .then((all) => {
        setProjects(all);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { projects, loadState, reload: load };
}
