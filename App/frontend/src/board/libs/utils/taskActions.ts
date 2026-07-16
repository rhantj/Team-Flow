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
