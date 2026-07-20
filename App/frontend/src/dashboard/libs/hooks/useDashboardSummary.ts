import { useCallback, useEffect, useState } from "react";
import { fetchDashboardSummary } from "../utils/dashboardApi";
import type { DashboardSummaryResponse } from "../types/dashboard";

export function useDashboardSummary(projectId: string = "demo-project") {
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDashboardSummary(projectId)
      .then(result => {
        if (!cancelled) setData(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => load(), [load]);

  return { data, loading, error, refetch: load };
}
