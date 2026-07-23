import { apiFetch } from "./apiClient";

export interface EvaluationScoreDto {
  projectId: number;
  userId: number;
  score: number;
  isPublic: boolean;
  reviewerScore: number | null;
  grade: string | null;
}

/**
 * 심사자가 팀원 최종 평가 점수를 확정하거나 공개 여부를 토글할 때 호출한다. 심사자만 호출 가능.
 * score/reviewerScore/grade는 모두 생략(undefined)하면 서버가 기존 값을 그대로 유지한다 —
 * 공개/비공개만 토글할 때는 score를 반드시 생략해야 학점 계산기가 저장한 총점을 덮어쓰지 않는다.
 */
export function upsertEvaluationScore(
  projectId: number,
  userId: number,
  score: number | undefined,
  isPublic: boolean,
  reviewerScore?: number,
  grade?: string,
) {
  return apiFetch<EvaluationScoreDto>(`/projects/${projectId}/evaluations`, {
    method: "POST",
    body: JSON.stringify({
      projectId,
      userId,
      score: score ?? null,
      isPublic,
      reviewerScore: reviewerScore ?? null,
      grade: grade ?? null,
    }),
  });
}

/** 심사자 화면에서 현재 공개/비공개 상태를 조회할 때 사용한다. 심사자만 호출 가능. */
export function getEvaluationScores(projectId: number) {
  return apiFetch<EvaluationScoreDto[]>(`/projects/${projectId}/evaluations`);
}

export interface EvaluationSettingDto {
  projectId: number;
  contributionRatio: number;
}

/** 학점 계산기의 기여 점수 반영 비율(%)을 조회한다. 저장한 적 없으면 기본값(40%)을 반환한다. 심사자만 호출 가능. */
export function getEvaluationSettings(projectId: number) {
  return apiFetch<EvaluationSettingDto>(`/projects/${projectId}/evaluation-settings`);
}

/** 학점 계산기의 기여 점수 반영 비율(%)을 저장한다. 프로젝트 공통 값으로 upsert된다. 심사자만 호출 가능. */
export function upsertEvaluationSettings(projectId: number, contributionRatio: number) {
  return apiFetch<EvaluationSettingDto>(`/projects/${projectId}/evaluation-settings`, {
    method: "PUT",
    body: JSON.stringify({ contributionRatio }),
  });
}

export interface MyEvaluationDto {
  revealed: boolean;
  score: number | null;
}

/** 마이페이지에서 로그인한 본인의 공개된 평가 결과를 조회한다. 비공개면 revealed=false, score=null. */
export function getMyEvaluation(projectId: number) {
  return apiFetch<MyEvaluationDto>(`/projects/${projectId}/evaluations/me`);
}
