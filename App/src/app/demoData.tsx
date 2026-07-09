import type { ReactNode } from "react";
import {
  FileAudio, GitCommit, GitMerge, GitPullRequest, FileText,
  CheckCircle2, Clock, AlertTriangle, Circle, MessageSquare,
  Layers, RefreshCw, Download, Eye, FileText as FileTextIcon,
} from "lucide-react";

export type Tab = "dashboard" | "board" | "meetings" | "deliverables" | "github" | "contributors" | "mypage";
export type TaskStatus = "todo" | "inprogress" | "done" | "blocked";
export type Priority = "high" | "medium" | "low";
export type DetailPage = "all-tasks" | "progress" | "blockers" | "inprogress" | "dash-progress" | "urgent" | "workload" | "activity" | null;

export interface Member { id: string; name: string; initials: string; color: string; role: string; }
export interface Task {
  id: string; title: string; status: TaskStatus; priority: Priority;
  assignee: string; dueDate: string; labels: string[];
}
export interface Meeting { id: string; title: string; date: string; duration: string; status: "processed" | "processing" | "pending"; summary?: string; decisions?: string[]; todos?: string[]; risks?: string[]; }
export interface GitRecord { type: "commit" | "pr" | "merge"; message: string; author: string; time: string; }
export interface Deliverable { id: string; type: string; title: string; status: "ready" | "draft" | "pending"; updatedAt: string; }

export const MEMBERS: Member[] = [
  { id: "1", name: "김민준", initials: "김", color: "#3B5BDB", role: "팀장" },
  { id: "2", name: "이서연", initials: "이", color: "#7048E8", role: "팀원" },
  { id: "3", name: "박지수", initials: "박", color: "#10B981", role: "팀원" },
  { id: "4", name: "최동혁", initials: "최", color: "#F59E0B", role: "팀원" },
];

export const TASKS: Task[] = [
  { id: "TF-01", title: "주차 감지 센서 모듈 연동", status: "done", priority: "high", assignee: "1", dueDate: "12.05", labels: ["개발"] },
  { id: "TF-02", title: "사용자 인증 API 구현", status: "done", priority: "high", assignee: "3", dueDate: "12.06", labels: ["백엔드"] },
  { id: "TF-03", title: "실시간 주차 현황 대시보드 UI", status: "done", priority: "medium", assignee: "3", dueDate: "12.08", labels: ["프론트"] },
  { id: "TF-04", title: "모바일 예약 화면 구현", status: "done", priority: "medium", assignee: "2", dueDate: "12.10", labels: ["프론트"] },
  { id: "TF-05", title: "결제 시스템 연동 (카카오페이)", status: "inprogress", priority: "high", assignee: "4", dueDate: "12.18", labels: ["백엔드"] },
  { id: "TF-06", title: "AI 빈자리 예측 모델 학습", status: "inprogress", priority: "high", assignee: "1", dueDate: "12.20", labels: ["AI"] },
  { id: "TF-07", title: "관리자 대시보드 통계 모듈", status: "inprogress", priority: "medium", assignee: "2", dueDate: "12.19", labels: ["프론트"] },
  { id: "TF-08", title: "푸시 알림 서비스 구현", status: "inprogress", priority: "low", assignee: "4", dueDate: "12.21", labels: ["백엔드"] },
  { id: "TF-09", title: "최종 발표 자료 작성", status: "todo", priority: "high", assignee: "1", dueDate: "12.28", labels: ["산출물"] },
  { id: "TF-10", title: "시스템 부하 테스트", status: "todo", priority: "medium", assignee: "2", dueDate: "12.23", labels: ["QA"] },
  { id: "TF-11", title: "README 및 배포 문서 작성", status: "todo", priority: "medium", assignee: "3", dueDate: "12.25", labels: ["문서"] },
  { id: "TF-12", title: "보안 취약점 점검 보고서", status: "todo", priority: "low", assignee: "4", dueDate: "12.26", labels: ["문서"] },
  { id: "TF-13", title: "DB 인덱싱 최적화", status: "blocked", priority: "high", assignee: "1", dueDate: "12.15", labels: ["백엔드"] },
  { id: "TF-14", title: "결제 오류 예외 처리", status: "blocked", priority: "high", assignee: "4", dueDate: "12.16", labels: ["백엔드"] },
];

export const MEETINGS: Meeting[] = [
  {
    id: "m1", title: "6차 정기 회의 — 중간 통합 점검", date: "2024.12.10", duration: "1시간 23분", status: "processed",
    summary: "결제 시스템 연동 지연 이슈와 AI 예측 모델 성능 검증 방안을 논의했습니다. 발표 자료 분량과 데모 시나리오 초안도 공유되었습니다.",
    decisions: ["카카오페이 대신 토스페이먼츠 SDK로 교체", "AI 모델 정확도 목표를 85% 이상으로 설정", "12월 28일 최종 발표 리허설 진행"],
    todos: ["최동혁: 토스페이먼츠 SDK 연동 완료 (12.18)", "김민준: AI 모델 정확도 검증 보고서 작성 (12.20)", "이서연: 발표 자료 목차 초안 작성 (12.14)"],
    risks: ["결제 연동 일정 지연으로 QA 시간 부족 가능성", "AI 모델 학습 데이터 부족 우려"],
  },
  {
    id: "m2", title: "5차 정기 회의 — API 통합 리뷰", date: "2024.12.03", duration: "58분", status: "processed",
    summary: "백엔드 API 통합 현황을 검토하고 프론트엔드 연동 이슈를 해결했습니다. 센서 모듈 실데이터 수집도 시작되었습니다.",
    decisions: ["API 응답 스키마 공통 규격 확정", "센서 데이터 폴링 주기 5초로 결정"],
    todos: ["박지수: 공통 API 응답 모델 적용 (12.06)", "이서연: 모바일 화면 UI 피드백 반영 (12.08)"],
    risks: ["센서 데이터 오류율 3% 초과 시 대안 필요"],
  },
  { id: "m3", title: "4차 정기 회의 — 기능 범위 확정", date: "2024.11.26", duration: "1시간 05분", status: "processed" },
  { id: "m4", title: "3차 정기 회의 — 아키텍처 설계", date: "2024.11.19", duration: "1시간 40분", status: "processed" },
  { id: "m5", title: "7차 회의 예정", date: "2024.12.17", duration: "—", status: "pending" },
];

export const GITHUB: GitRecord[] = [
  { type: "pr", message: "feat: 토스페이먼츠 SDK 연동 초안 (#18)", author: "최동혁", time: "1시간 전" },
  { type: "commit", message: "fix: 주차 공간 상태 실시간 업데이트 버그 수정", author: "김민준", time: "3시간 전" },
  { type: "commit", message: "feat: 관리자 통계 차트 컴포넌트 추가", author: "이서연", time: "5시간 전" },
  { type: "merge", message: "Merge PR #17: 모바일 예약 화면 완성", author: "김민준", time: "어제" },
  { type: "commit", message: "feat: AI 예측 모델 데이터 전처리 파이프라인", author: "김민준", time: "어제" },
  { type: "pr", message: "feat: 사용자 알림 서비스 기본 구조 (#19)", author: "최동혁", time: "2일 전" },
];

export const DELIVERABLES: Deliverable[] = [
  { id: "d1", type: "발표자료", title: "최종 발표 PPT 초안", status: "draft", updatedAt: "12.10" },
  { id: "d2", type: "보고서", title: "중간 진행 보고서", status: "ready", updatedAt: "12.05" },
  { id: "d3", type: "README", title: "GitHub README 초안", status: "draft", updatedAt: "12.08" },
  { id: "d4", type: "제안서", title: "공모전 제안서", status: "ready", updatedAt: "11.28" },
  { id: "d5", type: "회고", title: "주간 회고 문서 (6주차)", status: "pending", updatedAt: "—" },
];

export const WORKLOAD_DATA = [
  { name: "김민준", total: 10, done: 8, color: "#3B5BDB" },
  { name: "이서연", total: 8, done: 6, color: "#7048E8" },
  { name: "박지수", total: 8, done: 5, color: "#10B981" },
  { name: "최동혁", total: 8, done: 3, color: "#F59E0B" },
];

export const PROGRESS_HISTORY = [
  { week: "11/4", progress: 18 }, { week: "11/11", progress: 32 },
  { week: "11/18", progress: 45 }, { week: "11/25", progress: 58 },
  { week: "12/2", progress: 65 }, { week: "12/10", progress: 71 },
];

export const CHAT_INIT = [
  { role: "assistant", content: "안녕하세요 김민준님! WorkFlow AI 어시스턴트입니다.\n\n현재 **스마트 주차 관리 시스템** 프로젝트에 대해 무엇이든 물어보세요. 회의록, 업무, 일정, GitHub 기록을 바탕으로 답변드릴게요." }
];

export const QUICK_QUESTIONS = [
  "오늘 해야 할 일 알려줘", "마감 임박한 업무 뭐야?",
  "블로커 해결 방법 추천해줘", "발표자료 초안 만들어줘"
];

export const MEMBER_USER = {
  name: "이서연", email: "seo.yeon@university.ac.kr",
  affiliation: "컴퓨터공학과 3학년", field: "프론트엔드 / UX 설계",
  project: "스마트 주차 관리 시스템", github: "seo-yeon-dev",
  initials: "이", color: "#7048E8", joinedAt: "2024.09.15",
};

export const MY_TASKS = [
  { id: "TF-04", title: "모바일 예약 화면 구현", status: "done" as const, priority: "medium" as const, dueDate: "12.10", cat: "프론트" },
  { id: "TF-07", title: "관리자 대시보드 통계 모듈", status: "inprogress" as const, priority: "medium" as const, dueDate: "12.19", cat: "프론트" },
  { id: "TF-10", title: "시스템 부하 테스트", status: "todo" as const, priority: "medium" as const, dueDate: "12.23", cat: "QA" },
];

export const MY_DELIVERABLES = [
  { id: "d1", type: "발표자료", title: "최종 발표 PPT 초안", status: "draft", updatedAt: "12.10" },
  { id: "d2", type: "보고서", title: "중간 진행 보고서", status: "done", updatedAt: "12.05" },
];

export const MY_ACTIVITIES = [
  { type: "merge", msg: "PR #17 머지: 모바일 예약 화면 UI 완성", time: "어제" },
  { type: "commit", msg: "feat: 관리자 통계 차트 컴포넌트 추가", time: "5시간 전" },
  { type: "comment", msg: "TF-11 README 작성 방향 코멘트 남김", time: "어제" },
  { type: "meeting", msg: "6차 정기 회의 참석", time: "12.10" },
  { type: "file", msg: "발표자료 초안 PPT 파일 업로드", time: "2일 전" },
  { type: "pr", msg: "PR #12: 실시간 대시보드 UI 생성", time: "3일 전" },
];

export const MY_FEEDBACKS = [
  { from: "김민준 (팀장)", date: "12.10", content: "모바일 화면 UI 퀄리티가 좋습니다. 예약 플로우가 직관적으로 잘 구현되었어요.", isPublic: true, type: "leader" },
  { from: "AI 활동 분석", date: "12.09", content: "이번 주 PR 2건을 머지하고 회의록 To-Do를 90% 이상 완수했습니다.", isPublic: true, type: "ai" },
];

export const PUBLIC_SCORE = { revealed: true, score: 88, grade: "B+", from: "박현수 교수", date: "12.12", comment: "프론트엔드 구현 퀄리티가 우수하며 팀 내 협업 기여도가 높습니다." };

export const REVIEWER_USER = {
  name: "박현수 교수", email: "hspark@university.ac.kr",
  affiliation: "한국대학교 컴퓨터공학과", subject: "캡스톤디자인 2024-2",
  initials: "박", color: "#3B5BDB",
};

export const REVIEWER_TEAMS = [
  { id: "T1", name: "스마트 주차 관리 시스템", leader: "김민준", members: 4, progress: 71, evalStatus: "evaluating" as const, deliverables: 3, github: true, submitted: 2, type: "캡스톤" },
  { id: "T2", name: "AI 기반 식단 추천 앱", leader: "정민아", members: 3, progress: 54, evalStatus: "pending" as const, deliverables: 1, github: true, submitted: 0, type: "캡스톤" },
  { id: "T3", name: "실시간 버스 도착 알리미", leader: "이준혁", members: 5, progress: 88, evalStatus: "published" as const, deliverables: 5, github: true, submitted: 5, type: "캡스톤" },
  { id: "T4", name: "스터디 매칭 플랫폼", leader: "최지현", members: 4, progress: 42, evalStatus: "pending" as const, deliverables: 0, github: false, submitted: 0, type: "캡스톤" },
];

export const CONTRIB_REPORTS = [
  { memberId:"1", name:"김민준", role:"팀장", color:"#3B5BDB", todoDone:8, todoTotal:10, meetings:6, commits:35, prs:6,
    aiSummary:"팀장으로서 프로젝트 전반을 이끌며 AI 모델 개발에 집중 기여. 업무 완료율 80%, 커밋 비중 최고.",
    evidence:["To-Do #3,#6,#9,#12", "PR #5,#9,#14", "12.10 회의록"], score:92, isPublic:true,
    categories:{ task:85, meeting:90, docs:80, dev:95, collab:88 } },
  { memberId:"2", name:"이서연", role:"팀원", color:"#7048E8", todoDone:3, todoTotal:3, meetings:6, commits:18, prs:4,
    aiSummary:"프론트엔드 전반 담당. UI/UX 설계와 발표자료 준비에 기여. 회의 참석률 100%.",
    evidence:["To-Do #4,#7", "PR #12,#17", "11.26, 12.10 회의록"], score:88, isPublic:false,
    categories:{ task:100, meeting:100, docs:85, dev:80, collab:90 } },
  { memberId:"3", name:"박지수", role:"팀원", color:"#10B981", todoDone:3, todoTotal:3, meetings:5, commits:22, prs:5,
    aiSummary:"백엔드 API와 DB 설계 주도. 안정적 서버 환경 구축. 문서화 작업 적극 참여.",
    evidence:["To-Do #2,#11", "PR #8,#13", "12.03 회의록"], score:85, isPublic:false,
    categories:{ task:100, meeting:83, docs:90, dev:88, collab:82 } },
  { memberId:"4", name:"최동혁", role:"팀원", color:"#F59E0B", todoDone:1, todoTotal:3, meetings:4, commits:12, prs:3,
    aiSummary:"결제 연동 개발 중 블로커 이슈 발생으로 일정 지연. 현재 적극 해결 중. 개발 의지 높음.",
    evidence:["To-Do #5,#14", "PR #18(진행중)", "12.10 회의록 블로커 언급"], score:72, isPublic:false,
    categories:{ task:33, meeting:67, docs:60, dev:65, collab:75 } },
];

export const REVIEWER_ACTIVITIES = [
  { team: "스마트 주차 관리 시스템", action: "개인 코멘트 작성 완료", date: "12.12" },
  { team: "실시간 버스 도착 알리미", action: "최종 평가 점수 공개 완료", date: "12.11" },
  { team: "스마트 주차 관리 시스템", action: "기여도 리포트 검토", date: "12.10" },
  { team: "AI 기반 식단 추천 앱", action: "산출물 검토 시작", date: "12.09" },
];

export const Avatar = ({ member, size = "sm" }: { member: Member; size?: "sm" | "md" | "lg" }) => {
  const sizes = { sm: "w-7 h-7 text-xs", md: "w-9 h-9 text-sm", lg: "w-11 h-11 text-base" };
  return (
    <div className={`${sizes[size]} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}
      style={{ backgroundColor: member.color }}>
      {member.initials}
    </div>
  );
};

export const PriorityBadge = ({ priority }: { priority: Priority }) => {
  const map = {
    high: { label: "높음", cls: "bg-red-50 text-red-600" },
    medium: { label: "중간", cls: "bg-amber-50 text-amber-600" },
    low: { label: "낮음", cls: "bg-slate-100 text-slate-500" },
  };
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${map[priority].cls}`}>{map[priority].label}</span>;
};

export const LabelBadge = ({ label }: { label: string }) => (
  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{label}</span>
);

export const StatusIcon = ({ status }: { status: TaskStatus }) => {
  if (status === "done") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === "inprogress") return <Clock className="w-4 h-4 text-blue-500" />;
  if (status === "blocked") return <AlertTriangle className="w-4 h-4 text-red-500" />;
  return <Circle className="w-4 h-4 text-slate-300" />;
};

export const StatusBadge = ({ status }: { status: TaskStatus }) => {
  const m = { done:{ cls:"bg-emerald-100 text-emerald-700",l:"완료"}, inprogress:{cls:"bg-blue-100 text-blue-700",l:"진행 중"}, todo:{cls:"bg-slate-100 text-slate-600",l:"대기"}, blocked:{cls:"bg-red-100 text-red-700",l:"블로커"} };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${m[status].cls}`}>{m[status].l}</span>;
};

export const DelivBadge = ({ status }: { status: string }) => {
  const m: Record<string,string> = { done:"bg-emerald-100 text-emerald-600", draft:"bg-blue-100 text-blue-600", pending:"bg-slate-100 text-slate-500" };
  const l: Record<string,string> = { done:"완료", draft:"초안", pending:"생성 전" };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${m[status]??m.pending}`}>{l[status]??status}</span>;
};

export const SectionTitle = ({ children }: { children: ReactNode }) => (
  <div className="text-sm font-bold text-foreground mb-3">{children}</div>
);

export const ActIcon = ({ type }: { type: string }) => {
  const map: Record<string,{ Icon: any; color: string; bg: string }> = {
    commit: { Icon: GitCommit, color:"#6B7280", bg:"#F4F6FA" },
    pr: { Icon: GitPullRequest, color:"#3B5BDB", bg:"#EEF1FB" },
    merge: { Icon: GitMerge, color:"#10B981", bg:"#ECFDF5" },
    comment: { Icon: MessageSquare, color:"#8892A4", bg:"#F4F6FA" },
    meeting: { Icon: FileAudio, color:"#7048E8", bg:"rgba(112,72,232,0.1)" },
    file: { Icon: FileTextIcon, color:"#F59E0B", bg:"#FFFBEB" },
  };
  const { Icon, color, bg } = map[type] ?? map.comment;
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: bg }}>
      <Icon className="w-3.5 h-3.5" style={{ color }} />
    </div>
  );
};

