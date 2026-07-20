import { apiFetch } from "../../../global/api/apiClient";

interface RawMemberContribution {
  user_id: number;
  name: string;
  summary: string;
  evidence: string[];
}

export interface MemberContributionDto {
  userId: number;
  name: string;
  summary: string;
  evidence: string[];
}

export async function fetchContributionReport(projectId: number): Promise<MemberContributionDto[]> {
  const data = await apiFetch<RawMemberContribution[]>("/ai/contribution/report", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId }),
  });

  return data.map((item) => ({
    userId: item.user_id,
    name: item.name,
    summary: item.summary,
    evidence: item.evidence,
  }));
}
