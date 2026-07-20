import { useCallback, useEffect, useState } from "react";
import { fetchDashboardProgress, refreshDelayRisk } from "../utils/dashboardApi";
import type { ProgressDetailResponse } from "../types/dashboard";

export function useDashboardProgress(projectId: string = "demo-project") {
  const [data, setData] = useState<ProgressDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetchDashboardProgress(projectId)
      .then(result => setData(result))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const runDelayRiskAnalysis = useCallback(() => {
    setRefreshing(true);
    setError(null);
    return refreshDelayRisk(projectId)
      .then(result => setData(result))
      .catch((err: Error) => setError(err.message))
      .finally(() => setRefreshing(false));
  }, [projectId]);

  return { data, loading, refreshing, error, refetch: load, runDelayRiskAnalysis };
}
