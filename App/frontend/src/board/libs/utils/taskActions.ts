import {
  ArrowRight, User, CheckSquare, Bell, Sparkles, CheckCircle2, AlertTriangle,
  GitPullRequest, AlertCircle, CheckCheck, MessageSquare, Eye, RefreshCw,
} from "lucide-react";
import type { TaskStatus } from "../types/task";

export const STATUS_LABELS: Record<TaskStatus, string> = { todo: "할 일", inprogress: "진행 중", blocked: "보류/블로커", done: "완료" };

export const NEXT_STATUS: Record<TaskStatus, TaskStatus | null> = {
  todo: "inprogress", inprogress: "done", blocked: "inprogress", done: null,
};

export interface StatusAction { label: string; icon: any; primary?: boolean; danger?: boolean; }

export const STATUS_ACTIONS: Record<TaskStatus, StatusAction[]> = {
  todo: [
    { label:"진행 중으로 이동", icon:ArrowRight, primary:true },
    { label:"담당자 변경", icon:User },
    { label:"체크리스트 생성", icon:CheckSquare },
    { label:"시작 알림", icon:Bell },
    { label:"AI 업무 세분화", icon:Sparkles },
  ],
  inprogress: [
    { label:"완료로 이동", icon:CheckCircle2, primary:true },
    { label:"블로커 등록", icon:AlertTriangle, danger:true },
    { label:"PR 연결", icon:GitPullRequest },
    { label:"진행상황 요청", icon:Bell },
    { label:"AI 지연 분석", icon:Sparkles },
  ],
  blocked: [
    { label:"블로커 해결 완료", icon:CheckCircle2, primary:true },
    { label:"긴급 알림", icon:Bell, danger:true },
    { label:"담당자 재배정", icon:User },
    { label:"AI 해결안 보기", icon:Sparkles },
    { label:"영향 업무 확인", icon:AlertCircle },
  ],
  done: [
    { label:"검수 완료", icon:CheckCheck, primary:true },
    { label:"팀장 피드백", icon:MessageSquare },
    { label:"결과물 보기", icon:Eye },
    { label:"AI 완료 요약", icon:Sparkles },
    { label:"다시 열기", icon:RefreshCw },
  ],
};

const HIDDEN_ACTION_LABELS = new Set([
  "결과물 보기", "AI 완료 요약",
  "AI 업무 세분화", "AI 지연 분석", "AI 해결안 보기", // 실제 LLM 연동 없음
  "PR 연결", // GitHub 연동 범위 밖
  "영향 업무 확인", // 업무 간 의존관계 데이터 모델 없음
  "체크리스트 생성", // "체크리스트 자동 생성"과 기능 중복
]);
const LEADER_ONLY_LABELS = new Set(["팀장 피드백"]);

/** 점세개 메뉴에 실제로 보여줄 보조 액션만 남긴다(범위 밖 기능 숨김 + 팀장 전용 항목 권한 필터링). */
export function visibleSecondaryActions(actions: StatusAction[], isLeader: boolean): StatusAction[] {
  return actions.filter((a) => {
    if (HIDDEN_ACTION_LABELS.has(a.label)) return false;
    if (LEADER_ONLY_LABELS.has(a.label) && !isLeader) return false;
    return true;
  });
}

const QUICK_MOVE: Partial<Record<string, Partial<Record<TaskStatus, TaskStatus>>>> = {
  "다시 열기": { done: "inprogress" },
  "블로커 등록": { inprogress: "blocked" },
};

/** primary CTA와 무관하게 라벨 자체가 상태 이동을 의미하는 보조 액션의 목적지 상태. 해당 없으면 null(다른 핸들러가 처리). */
export function quickMoveTargetStatus(label: string, status: TaskStatus): TaskStatus | null {
  return QUICK_MOVE[label]?.[status] ?? null;
}
