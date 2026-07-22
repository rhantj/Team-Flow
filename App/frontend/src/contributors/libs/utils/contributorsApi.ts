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

interface RawContributionMemberScore {
  assignee_id: string;
  workload_component: number;
  task_component: number;
  meeting_component: number;
  contribution_score: number;
  anomaly_type: string;
  task_count_active_rel: number;
  difficulty_avg_rel: number;
  overdue_count: number;
}

interface RawContributionScoreData {
  schema_version: string;
  project_id: number;
  members: RawContributionMemberScore[];
  note: string | null;
}

export interface ContributionMemberScoreDto {
  assigneeId: string;
  workloadComponent: number;
  taskComponent: number;
  meetingComponent: number;
  contributionScore: number;
  anomalyType: string;
  taskCountActiveRel: number;
  difficultyAvgRel: number;
  overdueCount: number;
}

export interface ContributionScoreResult {
  members: ContributionMemberScoreDto[];
  note: string | null;
}

export async function fetchContributionScore(projectId: number): Promise<ContributionScoreResult> {
  const data = await apiFetch<RawContributionScoreData>("/ai/contribution/score", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId }),
  });

  return {
    members: data.members.map((m) => ({
      assigneeId: m.assignee_id,
      workloadComponent: m.workload_component,
      taskComponent: m.task_component,
      meetingComponent: m.meeting_component,
      contributionScore: m.contribution_score,
      anomalyType: m.anomaly_type,
      taskCountActiveRel: m.task_count_active_rel,
      difficultyAvgRel: m.difficulty_avg_rel,
      overdueCount: m.overdue_count,
    })),
    note: data.note,
  };
}
