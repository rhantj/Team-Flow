import { useState, useRef, useEffect, type ReactNode } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend
} from "recharts";
import {
  LayoutDashboard, Columns3, FileAudio, Github, Package, Sparkles,
  ChevronDown, Bell, Search, Plus, AlertTriangle, CheckCircle2, Clock,
  X, Send, GitCommit, GitPullRequest, Calendar, ChevronRight,
  Settings, Zap, Upload, BarChart3, Shield,
  Circle, CheckCheck, GitMerge, FileText, Layers, Hash,
  MoreHorizontal, Mic, Link2, Eye, CheckSquare, TrendingUp,
  ArrowRight, ArrowLeft, Copy, Check, EyeOff, Mail, Lock,
  User, Users, Trophy, Cpu, GraduationCap, PenLine, Link, UserCheck,
  AlertCircle, MessageSquare, RefreshCw,
  Monitor, Server, Database, GitBranch, Palette, Target, Cloud,
  Layout, BookOpen, FlaskConical, Film, ListChecks, Radio,
  Download, Pencil, Globe, Code2, ClipboardList, Star, Trash2
} from "lucide-react";
import { MyPage } from "./MyPage";
import { analyzeMeeting } from "./meetingAiApi";
import type { MeetingAiResult } from "./meetingAiTypes";

// ─── types ───────────────────────────────────────────────────────────────────
type Tab = "dashboard" | "board" | "meetings" | "deliverables" | "github" | "contributors" | "mypage";
type TaskStatus = "todo" | "inprogress" | "done" | "blocked";
type Priority = "high" | "medium" | "low";
type DetailPage = "all-tasks" | "progress" | "blockers" | "inprogress" | "dash-progress" | "urgent" | "workload" | "activity" | null;

const getDesignParam = (key: string) => {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
};

const getDesignStep = (key: string, fallback = 0) => {
  const parsed = Number(getDesignParam(key));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isDesignCapture = () => getDesignParam("capture") === "1";

interface Member { id: string; name: string; initials: string; color: string; role: string; }
interface Task {
  id: string; title: string; status: TaskStatus; priority: Priority;
  assignee: string; dueDate: string; labels: string[];
}
interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: string;
  status: "processed" | "processing" | "pending";
  summary?: string;
  decisions?: string[];
  todos?: string[];
  risks?: string[];
  analysisSource?: "fastapi" | "spring-fallback";
}
interface SavedMeetingRecord {
  meetingId: string;
  title: string;
  meetingDate: string;
  meetingKind: string;
  participants: string[];
  originalFileName: string;
  fileType: UploadType;
  summary: string;
  decisions: string[];
  risks: string[];
  actionItems: GenTodo[];
  createdAt: string;
  source: "MEETING_AI";
}
interface GitRecord { type: "commit" | "pr" | "merge"; message: string; author: string; time: string; }
interface Deliverable { id: string; type: string; title: string; status: "ready" | "draft" | "pending"; updatedAt: string; }

// ─── mock data ────────────────────────────────────────────────────────────────
const MEMBERS: Member[] = [
  { id: "1", name: "김민준", initials: "김", color: "#3B5BDB", role: "팀장" },
  { id: "2", name: "이서연", initials: "이", color: "#7048E8", role: "팀원" },
  { id: "3", name: "박지수", initials: "박", color: "#10B981", role: "팀원" },
  { id: "4", name: "최동혁", initials: "최", color: "#F59E0B", role: "팀원" },
];

const TASKS: Task[] = [];

const MEETINGS: Meeting[] = [];

const GITHUB: GitRecord[] = [
  { type: "pr", message: "feat: 토스페이먼츠 SDK 연동 초안 (#18)", author: "최동혁", time: "1시간 전" },
  { type: "commit", message: "fix: 주차 공간 상태 실시간 업데이트 버그 수정", author: "김민준", time: "3시간 전" },
  { type: "commit", message: "feat: 관리자 통계 차트 컴포넌트 추가", author: "이서연", time: "5시간 전" },
  { type: "merge", message: "Merge PR #17: 모바일 예약 화면 완성", author: "김민준", time: "어제" },
  { type: "commit", message: "feat: AI 예측 모델 데이터 전처리 파이프라인", author: "김민준", time: "어제" },
  { type: "pr", message: "feat: 사용자 알림 서비스 기본 구조 (#19)", author: "최동혁", time: "2일 전" },
];

const DELIVERABLES: Deliverable[] = [
  { id: "d1", type: "발표자료", title: "최종 발표 PPT 초안", status: "draft", updatedAt: "12.10" },
  { id: "d2", type: "보고서", title: "중간 진행 보고서", status: "ready", updatedAt: "12.05" },
  { id: "d3", type: "README", title: "GitHub README 초안", status: "draft", updatedAt: "12.08" },
  { id: "d4", type: "제안서", title: "공모전 제안서", status: "ready", updatedAt: "11.28" },
  { id: "d5", type: "회고", title: "주간 회고 문서 (6주차)", status: "pending", updatedAt: "—" },
];


const TASK_STORAGE_KEY = "workflow-ai.tasks";
const MEETING_STORAGE_KEY = "workflow-ai.meetings";
const TASKS_UPDATED_EVENT = "workflow-ai:tasks-updated";
const MEETINGS_UPDATED_EVENT = "workflow-ai:meetings-updated";

const readStoredArray = <T,>(key: string, fallback: T[] = []): T[] => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const writeStoredArray = <T,>(key: string, eventName: string, value: T[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(eventName, { detail: value }));
};

const getStoredTasks = () => readStoredArray<Task>(TASK_STORAGE_KEY, TASKS);
const getStoredMeetings = () => readStoredArray<Meeting>(MEETING_STORAGE_KEY, MEETINGS);
const saveStoredTasks = (tasks: Task[]) => writeStoredArray(TASK_STORAGE_KEY, TASKS_UPDATED_EVENT, tasks);
const saveStoredMeetings = (meetings: Meeting[]) => writeStoredArray(MEETING_STORAGE_KEY, MEETINGS_UPDATED_EVENT, meetings);

const SAVED_MEETING_STORAGE_KEY = "workflow-ai.saved-meetings";
const SAVED_MEETINGS_UPDATED_EVENT = "workflow-ai:saved-meetings-updated";
const getSavedMeetings = () => readStoredArray<SavedMeetingRecord>(SAVED_MEETING_STORAGE_KEY, []);
const saveSavedMeetings = (records: SavedMeetingRecord[]) => writeStoredArray(SAVED_MEETING_STORAGE_KEY, SAVED_MEETINGS_UPDATED_EVENT, records);

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

function useStoredTasks() {
  const [tasks, setTasks] = useState<Task[]>(getStoredTasks);

  useEffect(() => {
    const sync = () => setTasks(getStoredTasks());
    window.addEventListener(TASKS_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(TASKS_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return tasks;
}

function useStoredMeetings() {
  const [meetings, setMeetings] = useState<Meeting[]>(getStoredMeetings);

  useEffect(() => {
    const sync = () => setMeetings(getStoredMeetings());
    window.addEventListener(MEETINGS_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MEETINGS_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return meetings;
}

const CHAT_INIT = [
  { role: "assistant", content: "안녕하세요 김민준님! TeamFlow AI 어시스턴트입니다.\n\n현재 **스마트 주차 관리 시스템** 프로젝트에 대해 무엇이든 물어보세요. 회의록, 업무, 일정, GitHub 기록을 바탕으로 답변드릴게요." }
];

const QUICK_QUESTIONS = [
  "오늘 해야 할 일 알려줘", "마감 임박한 업무 뭐야?",
  "블로커 해결 방법 추천해줘", "발표자료 초안 만들어줘"
];

const CURRENT_USER_ROLE = "leader";
const ROLE_LABEL = { leader: "팀장", member: "팀원", reviewer: "심사자" } as const;

// ─── helper components ────────────────────────────────────────────────────────
const Avatar = ({ member, size = "sm" }: { member: Member; size?: "sm" | "md" | "lg" }) => {
  const sizes = { sm: "w-7 h-7 text-xs", md: "w-9 h-9 text-sm", lg: "w-11 h-11 text-base" };
  return (
    <div className={`${sizes[size]} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}
      style={{ backgroundColor: member.color }}>
      {member.initials}
    </div>
  );
};

const PriorityBadge = ({ priority }: { priority: Priority }) => {
  const map = { high: { label: "높음", cls: "bg-red-50 text-red-600" }, medium: { label: "중간", cls: "bg-amber-50 text-amber-600" }, low: { label: "낮음", cls: "bg-slate-100 text-slate-500" } };
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${map[priority].cls}`}>{map[priority].label}</span>;
};

const LabelBadge = ({ label }: { label: string }) => (
  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{label}</span>
);

const StatusIcon = ({ status }: { status: TaskStatus }) => {
  if (status === "done") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === "inprogress") return <Clock className="w-4 h-4 text-blue-500" />;
  if (status === "blocked") return <AlertTriangle className="w-4 h-4 text-red-500" />;
  return <Circle className="w-4 h-4 text-slate-300" />;
};

// ─── sidebar ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "dashboard", label: "대시보드", icon: LayoutDashboard, group: "planning" },
  { id: "board", label: "업무 보드", icon: Columns3, group: "planning" },
  { id: "meetings", label: "회의록 AI", icon: FileAudio, group: "ai", badge: "AI" },
  { id: "deliverables", label: "산출물 생성", icon: Package, group: "ai", badge: "AI" },
  { id: "github", label: "GitHub 연동", icon: Github, group: "dev" },
  { id: "contributors", label: "기여도 분석", icon: Shield, group: "eval", lock: true },
  { id: "mypage",       label: "마이페이지",  icon: User,   group: "me" },
];

function Sidebar({ active, onSelect, onAI }: { active: Tab; onSelect: (t: Tab) => void; onAI: () => void }) {
  const groups: Record<string, string> = { planning: "계획 관리", ai: "AI 기능", dev: "개발", eval: "평가 (심사자 전용)", me: "내 계정" };
  const rendered: string[] = [];
  const visibleNavItems = NAV_ITEMS.filter(item => {
    if (CURRENT_USER_ROLE === "leader") return item.id !== "contributors";
    return true;
  });

  return (
    <div className="w-[220px] shrink-0 flex flex-col h-full" style={{ background: "var(--sidebar)", fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      {/* Logo */}
      <div className="px-5 pt-6 pb-4 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: "var(--sidebar-primary)" }}>
          TF
        </div>
        <div>
          <div className="text-white font-semibold text-sm leading-none">TeamFlow</div>
          <div className="text-[10px] font-medium mt-0.5" style={{ color: "var(--accent)" }}>AI Powered</div>
        </div>
      </div>

      {/* Project selector */}
      <div className="mx-3 mb-4">
        <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors"
          style={{ background: "var(--sidebar-accent)" }}>
          <div className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center">
            <Hash className="w-3 h-3 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">스마트 주차 관리</div>
            <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>캡스톤디자인 2024</div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--muted-foreground)" }} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
        {visibleNavItems.map((item) => {
          const showGroup = !rendered.includes(item.group);
          if (showGroup) rendered.push(item.group);
          const isActive = active === item.id;

          return (
            <div key={item.id}>
              {showGroup && (
                <div className="text-[10px] font-semibold uppercase tracking-wider px-2 pt-4 pb-1.5" style={{ color: "var(--muted-foreground)" }}>
                  {groups[item.group]}
                </div>
              )}
              <button
                onClick={() => onSelect(item.id as Tab)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-sm ${isActive ? "text-white" : "hover:text-white"}`}
                style={{
                  background: isActive ? "var(--sidebar-primary)" : "transparent",
                  color: isActive ? "white" : "var(--sidebar-foreground)",
                  opacity: item.lock ? 0.6 : 1,
                }}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 font-medium">{item.label}</span>
                {item.badge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(112,72,232,0.3)", color: "#A78BFA" }}>
                    {item.badge}
                  </span>
                )}
                {item.lock && <Shield className="w-3 h-3 opacity-60" />}
              </button>
            </div>
          );
        })}

        {/* AI Assistant button */}
        <div className="pt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider px-2 pb-1.5" style={{ color: "var(--muted-foreground)" }}>
            어시스턴트
          </div>
          <button
            onClick={onAI}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-sm text-white"
            style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="font-medium">AI 어시스턴트</span>
          </button>
        </div>
      </nav>

      {/* User */}
      <div className="p-3 mt-2 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{ background: "#3B5BDB" }}>
            김
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white">김민준</div>
            <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>팀장</div>
          </div>
          <Settings className="w-4 h-4 cursor-pointer" style={{ color: "var(--muted-foreground)" }} />
        </div>
      </div>
    </div>
  );
}

type ActivityType = "task_create" | "meeting" | "ai";
interface Activity { id: string; type: ActivityType; actor: string; time: string; message: string; target: string; }

function StatCard({ icon: Icon, label, value, sub, color, onClick }: { icon: any; label: string; value: string | number; sub: string; color: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`bg-card rounded-xl p-5 flex flex-col gap-3 shadow-sm border border-border transition-all ${onClick ? "cursor-pointer hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 group" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground font-medium">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
      </div>
      {onClick && (
        <div className="flex items-center gap-1 text-[10px] font-medium text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
          자세히 보기 <ChevronRight className="w-3 h-3" />
        </div>
      )}
    </div>
  );
}

function DashboardView({ onCardClick }: { onCardClick?: (p: DetailPage) => void }) {
  const tasks = useStoredTasks();
  const meetings = useStoredMeetings();
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const atRiskTasks = tasks.filter(t => t.status === "blocked");
  const inProgressTasks = tasks.filter(t => t.status === "inprogress");
  const atRisk = atRiskTasks.length;
  const inProgress = inProgressTasks.length;
  const progressPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const progressData = [{ week: "현재", progress: progressPct }];
  const urgentTasks = tasks.filter(t => t.status !== "done").slice(0, 5);
  const workloadData = MEMBERS.map(member => {
    const memberTasks = tasks.filter(t => t.assignee === member.id);
    return {
      name: member.name,
      total: memberTasks.length,
      done: memberTasks.filter(t => t.status === "done").length,
      color: member.color,
    };
  });
  const recentActivity = [
    ...meetings.slice(0, 3).map(meeting => ({
      icon: FileAudio,
      message: `${meeting.title} 분석 완료`,
      author: "회의록 AI",
      time: meeting.date,
      color: "#7048E8",
      bg: "rgba(112,72,232,0.1)",
    })),
    ...tasks.slice(0, 3).map(task => {
      const member = MEMBERS.find(m => m.id === task.assignee) ?? MEMBERS[0];
      return {
        icon: CheckSquare,
        message: `${task.title} 업무 등록`,
        author: member.name,
        time: `마감 ${task.dueDate}`,
        color: "#3B5BDB",
        bg: "rgba(59,91,219,0.1)",
      };
    }),
  ].slice(0, 5);

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      {/* AI Recommendation Banner */}
      <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
        <Sparkles className="w-5 h-5 text-white shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">AI 추천 액션</div>
          <div className="text-xs text-purple-100 mt-0.5">
            {totalTasks
              ? `회의록 AI로 등록된 ${totalTasks}개 업무를 기준으로 진행률과 위험 업무를 추적 중입니다.`
              : "회의록 AI에서 To-Do를 등록하면 추천 액션, 진행률, 마감 임박 업무가 이곳에 표시됩니다."}
          </div>
        </div>
        <button className="text-xs font-medium text-white bg-white/20 px-3 py-1.5 rounded-lg hover:bg-white/30 transition-colors shrink-0">
          자세히
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Layers} label="전체 업무" value={totalTasks} sub={`완료 ${doneTasks}개`} color="#3B5BDB" onClick={() => onCardClick?.("all-tasks")} />
        <StatCard icon={TrendingUp} label="완료율" value={`${progressPct}%`} sub="목표 100% (12.30)" color="#10B981" onClick={() => onCardClick?.("progress")} />
        <StatCard icon={AlertTriangle} label="블로커" value={atRisk} sub="즉시 해결 필요" color="#EF4444" onClick={() => onCardClick?.("blockers")} />
        <StatCard icon={Clock} label="진행 중" value={inProgress} sub="D-18 마감" color="#F59E0B" onClick={() => onCardClick?.("inprogress")} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Progress card */}
        <div onClick={() => onCardClick?.("dash-progress")} className="col-span-2 bg-card rounded-xl p-5 shadow-sm border border-border cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-foreground">전체 진행률</div>
              <div className="text-xs text-muted-foreground mt-0.5">마감까지 18일 남음</div>
            </div>
            <div className="text-2xl font-bold" style={{ color: "var(--primary)" }}>{progressPct}%</div>
          </div>
          <div className="w-full bg-muted rounded-full h-2 mb-1">
            <div className="h-2 rounded-full transition-all" style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #3B5BDB, #7048E8)" }} />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
            <span>0%</span><span>목표 100%</span>
          </div>

          <div className="mt-5 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={progressData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                <defs>
                  <linearGradient id="progGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop key="s1" offset="5%" stopColor="#3B5BDB" stopOpacity={0.18} />
                    <stop key="s2" offset="95%" stopColor="#3B5BDB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid key="acg" strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis key="ax" dataKey="week" tick={{ fontSize: 10, fill: "#8892A4" }} />
                <YAxis key="ay" tick={{ fontSize: 10, fill: "#8892A4" }} />
                <Tooltip key="att" contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                <Area key="area-progress" type="monotone" dataKey="progress" stroke="#3B5BDB" strokeWidth={2} fill="url(#progGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Deadline list */}
        <div onClick={() => onCardClick?.("urgent")} className="bg-card rounded-xl p-5 shadow-sm border border-border cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">마감 임박 업무</div>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {urgentTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
                <div className="text-xs font-semibold text-foreground">표시할 업무가 없습니다</div>
                <div className="text-[10px] text-muted-foreground mt-1">회의록 AI에서 업무를 등록하면 마감 임박 업무가 표시됩니다.</div>
              </div>
            ) : urgentTasks.map(task => {
              const m = MEMBERS.find(m => m.id === task.assignee) ?? MEMBERS[0];
              return (
                <div key={task.id} className="flex items-center gap-2.5">
                  <StatusIcon status={task.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{task.title}</div>
                    <div className="text-[10px] text-muted-foreground">마감 {task.dueDate}</div>
                  </div>
                  <Avatar member={m} size="sm" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Team workload + Activity */}
      <div className="grid grid-cols-2 gap-4">
        {/* Team workload */}
        <div onClick={() => onCardClick?.("workload")} className="bg-card rounded-xl p-5 shadow-sm border border-border cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">팀원별 업무량</div>
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {workloadData.map(m => (
              <div key={m.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-foreground">{m.name}</span>
                  <span className="text-muted-foreground">{m.done}/{m.total}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${m.total ? (m.done / m.total) * 100 : 0}%`, background: m.color }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workloadData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                <CartesianGrid key="bcg" strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis key="bx" dataKey="name" tick={{ fontSize: 10, fill: "#8892A4" }} />
                <YAxis key="by" tick={{ fontSize: 10, fill: "#8892A4" }} />
                <Tooltip key="btt" contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                <Bar key="bar-total" dataKey="total" fill="#EEF1FB" radius={[3, 3, 0, 0]} />
                <Bar key="bar-done" dataKey="done" fill="#3B5BDB" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent activity */}
        <div onClick={() => onCardClick?.("activity")} className="bg-card rounded-xl p-5 shadow-sm border border-border cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">최근 활동</div>
            <Zap className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {recentActivity.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
                <div className="text-xs font-semibold text-foreground">최근 활동이 없습니다</div>
                <div className="text-[10px] text-muted-foreground mt-1">회의록 분석 또는 업무 등록 후 활동이 표시됩니다.</div>
              </div>
            ) : recentActivity.map((g, i) => {
              const Icon = g.icon;
              return (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: g.bg }}>
                  <Icon className="w-3 h-3" style={{ color: g.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-foreground font-medium truncate">{g.message}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{g.author} · {g.time}</div>
                </div>
              </div>
            ); })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── board (redesigned: category-based) ──────────────────────────────────────
type CatId = "planning"|"research"|"ux-ui"|"design"|"frontend"|"backend"|"ai-ml"|"data"|"db"|"devops"|"github"|"qa"|"security"|"docs"|"presentation"|"deliverable"|"operation"|"other";
interface CategoryDef { id: CatId; label: string; desc: string; icon: any; color: string; bg: string; }

const CATEGORIES: CategoryDef[] = [
  { id:"planning",     label:"기획",       desc:"요구사항 정리, 기능 정의, 일정",      icon:Target,         color:"#6366F1", bg:"rgba(99,102,241,0.12)"  },
  { id:"research",     label:"리서치",     desc:"시장조사, 논문, 경쟁 서비스 분석",    icon:BookOpen,       color:"#8B5CF6", bg:"rgba(139,92,246,0.12)"  },
  { id:"ux-ui",        label:"UX/UI",      desc:"와이어프레임, 사용자 흐름, 화면 설계", icon:Layout,        color:"#EC4899", bg:"rgba(236,72,153,0.12)"  },
  { id:"design",       label:"디자인",     desc:"시각 디자인, 포스터, 발표자료",       icon:Palette,        color:"#F43F5E", bg:"rgba(244,63,94,0.12)"   },
  { id:"frontend",     label:"프론트엔드", desc:"화면 구현, 컴포넌트 개발, 반응형",   icon:Monitor,        color:"#3B5BDB", bg:"rgba(59,91,219,0.12)"   },
  { id:"backend",      label:"백엔드",     desc:"API, 서버 로직, 인증, 권한",         icon:Server,         color:"#0EA5E9", bg:"rgba(14,165,233,0.12)"  },
  { id:"ai-ml",        label:"AI/ML",      desc:"모델 설계, 학습, 추론 알고리즘",     icon:Cpu,            color:"#10B981", bg:"rgba(16,185,129,0.12)"  },
  { id:"data",         label:"데이터",     desc:"수집, 전처리, 라벨링, EDA",          icon:BarChart3,      color:"#14B8A6", bg:"rgba(20,184,166,0.12)"  },
  { id:"db",           label:"DB",         desc:"테이블 설계, ERD, 쿼리 최적화",      icon:Database,       color:"#7C3AED", bg:"rgba(124,58,237,0.12)"  },
  { id:"devops",       label:"DevOps",     desc:"배포, 서버 설정, CI/CD",             icon:Cloud,          color:"#F59E0B", bg:"rgba(245,158,11,0.12)"  },
  { id:"github",       label:"GitHub",     desc:"브랜치, PR, 코드리뷰, 충돌 해결",   icon:GitBranch,      color:"#374151", bg:"rgba(55,65,81,0.12)"    },
  { id:"qa",           label:"QA/테스트",  desc:"기능 테스트, 버그 리포트, 성능",     icon:FlaskConical,   color:"#F97316", bg:"rgba(249,115,22,0.12)"  },
  { id:"security",     label:"보안",       desc:"취약점 점검, 인증/인가, 접근 제어",  icon:Shield,         color:"#DC2626", bg:"rgba(220,38,38,0.12)"   },
  { id:"docs",         label:"문서",       desc:"README, 보고서, 회의록, 설명서",     icon:FileText,       color:"#6B7280", bg:"rgba(107,114,128,0.12)" },
  { id:"presentation", label:"발표",       desc:"PPT, 발표 대본, 시연 준비",          icon:Layers,         color:"#D946EF", bg:"rgba(217,70,239,0.12)"  },
  { id:"deliverable",  label:"산출물",     desc:"최종 보고서, 제안서, 제출 파일",     icon:Package,        color:"#0F766E", bg:"rgba(15,118,110,0.12)"  },
  { id:"operation",    label:"운영/제출",  desc:"공모전 제출, 교수 제출, 마감 체크",  icon:CheckCheck,     color:"#059669", bg:"rgba(5,150,105,0.12)"   },
  { id:"other",        label:"기타",       desc:"직접 카테고리명 입력",               icon:MoreHorizontal, color:"#9CA3AF", bg:"rgba(156,163,175,0.12)" },
];

const BOARD_COLS = [
  { id:"todo"       as TaskStatus, label:"할 일",       color:"#8892A4", bg:"#F4F6FA" },
  { id:"inprogress" as TaskStatus, label:"진행 중",     color:"#3B5BDB", bg:"#EEF1FB" },
  { id:"blocked"    as TaskStatus, label:"보류/블로커", color:"#EF4444", bg:"#FEF2F2" },
  { id:"done"       as TaskStatus, label:"완료",        color:"#10B981", bg:"#ECFDF5" },
];

function getCat(id: string): CategoryDef { return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]; }

function CatTag({ catId }: { catId: string }) {
  const cat = getCat(catId);
  const Icon = cat.icon;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap" style={{ background: cat.bg, color: cat.color }}>
      <Icon className="w-2.5 h-2.5 shrink-0" />{cat.label}
    </span>
  );
}

function BoardView() {
  const boardTasks = useStoredTasks();
  const [selId, setSelId] = useState<string|null>(getDesignParam("boardTask"));
  const [showModal, setShowModal] = useState(getDesignParam("boardModal") === "1");
  const [step, setStep] = useState(getDesignStep("boardStep"));
  const [selCat, setSelCat] = useState(getDesignParam("boardCat") ?? "");
  const [customCat, setCustomCat] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fAssignee, setFAssignee] = useState("1");
  const [fDue, setFDue] = useState("");
  const [fPriority, setFPriority] = useState<Priority>("medium");
  const [fStatus, setFStatus] = useState<TaskStatus>("todo");
  const [fCriteria, setFCriteria] = useState("");
  const [panelTab, setPanelTab] = useState<"info"|"cat"|"activity"|"ai">("info");
  const [newComment, setNewComment] = useState("");

  const getTaskCategory = (task: Task): CatId => {
    const matchedLabel = task.labels.find(label => CATEGORIES.some(category => category.label === label));
    return CATEGORIES.find(category => category.label === matchedLabel)?.id ?? "other";
  };

  const selTask = selId ? boardTasks.find(t => t.id === selId) : null;
  const taskCat = selTask ? getTaskCategory(selTask) : "other";
  const catDef = getCat(taskCat);

  const openModal = (status: TaskStatus) => {
    setFStatus(status); setSelCat(""); setStep(0); setShowModal(true);
    setFTitle(""); setFDesc(""); setFDue(""); setFPriority("medium"); setFCriteria("");
  };

  const handleCreateTask = () => {
    const categoryLabel = selCat === "other" ? (customCat.trim() || "기타") : getCat(selCat).label;
    const newTask: Task = {
      id: `TASK-${Date.now()}`,
      title: fTitle.trim() || `${categoryLabel} 업무`,
      status: fStatus,
      priority: fPriority,
      assignee: fAssignee,
      dueDate: formatAiDueDate(fDue || null),
      labels: [categoryLabel],
    };
    saveStoredTasks([newTask, ...getStoredTasks()]);
  };

  const updateTaskStatus = (taskId: string, status: TaskStatus) => {
    saveStoredTasks(getStoredTasks().map(t => t.id === taskId ? { ...t, status } : t));
  };

  const updateTaskAssignee = (taskId: string, assignee: string) => {
    saveStoredTasks(getStoredTasks().map(t => t.id === taskId ? { ...t, assignee } : t));
  };

  const updateTaskDueDate = (taskId: string, dueDate: string) => {
    saveStoredTasks(getStoredTasks().map(t => t.id === taskId ? { ...t, dueDate } : t));
  };

  const deleteTask = (taskId: string) => {
    saveStoredTasks(getStoredTasks().filter(t => t.id !== taskId));
    setSelId(null);
  };

  // ── per-status action sets ──────────────────────────────────────────────────
  const STATUS_ACTIONS: Record<TaskStatus, { label: string; icon: any; primary?: boolean; danger?: boolean; nextStatus?: TaskStatus }[]> = {
    todo: [
      { label:"진행 중으로 이동", icon:ArrowRight, primary:true, nextStatus:"inprogress" },
      { label:"담당자 변경", icon:User },
      { label:"체크리스트 생성", icon:CheckSquare },
      { label:"시작 알림", icon:Bell },
      { label:"AI 업무 세분화", icon:Sparkles },
    ],
    inprogress: [
      { label:"완료로 이동", icon:CheckCircle2, primary:true, nextStatus:"done" },
      { label:"블로커 등록", icon:AlertTriangle, danger:true, nextStatus:"blocked" },
      { label:"PR 연결", icon:GitPullRequest },
      { label:"진행상황 요청", icon:Bell },
      { label:"AI 지연 분석", icon:Sparkles },
    ],
    blocked: [
      { label:"블로커 해결 완료", icon:CheckCircle2, primary:true, nextStatus:"inprogress" },
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
      { label:"다시 열기", icon:RefreshCw, nextStatus:"todo" },
    ],
  };

  // ── category-specific modal fields (step 2) ─────────────────────────────────
  const CAT_MODAL_FIELDS: Record<string, [string, string][]> = {
    frontend:     [["화면 이름","구현할 화면명"],["컴포넌트","예: Header, SearchBar"],["연결 API","예: /api/v1/users"],["Figma 링크","https://figma.com/..."],["GitHub 브랜치","예: feature/user-list"]],
    backend:      [["API 이름","예: 사용자 로그인 API"],["Method","GET / POST / PUT / DELETE"],["Endpoint","예: /api/v1/auth/login"],["연결 DB 테이블","예: users, sessions"],["인증 필요 여부","필요 / 불필요"]],
    "ai-ml":      [["모델 목적","예: 주차 빈자리 예측"],["사용 데이터","예: 90일치 센서 데이터"],["모델 종류","예: Random Forest, LSTM"],["평가 지표","예: Accuracy, RMSE"],["목표 성능","예: Accuracy 90% 이상"]],
    data:         [["데이터 출처","예: CCTV 센서, 공공데이터"],["데이터 형식","예: CSV, JSON, 이미지"],["수집 목표량","예: 90일치 / 10만 건"],["전처리 방법","예: 결측치 제거, 정규화"]],
    db:           [["테이블명","예: users, spaces"],["ERD 상태","예: 설계 완료 / 수정 중"],["쿼리 이슈","예: 풀스캔 발생"],["인덱스 여부","적용 / 미적용"]],
    devops:       [["배포 환경","예: AWS EC2, Docker"],["배포 상태","예: 개발 서버 배포 완료"],["CI/CD 도구","예: GitHub Actions"]],
    github:       [["브랜치명","예: feature/payment-flow"],["PR 번호","예: PR #18"],["리뷰 상태","리뷰 대기 / 완료"],["충돌 여부","없음 / 있음"]],
    qa:           [["테스트 대상","예: 예약 API 전체"],["테스트 케이스","예: 정상 흐름, 경계값"],["기대 결과","예: 응답 2초 이내"],["테스트 방법","수동 / 자동 / 부하"]],
    security:     [["점검 대상","예: 로그인 API, 권한 검사"],["위험 수준","높음 / 중간 / 낮음"],["발견된 취약점","예: SQL Injection 가능성"],["조치 방법","예: Prepared Statement"]],
    docs:         [["문서 종류","예: README / 보고서 / 설명서"],["작성 범위","예: API 명세 전체"],["포함할 내용","예: 설치 방법, 주요 기능"]],
    presentation: [["발표 주제","예: AI 기반 스마트 주차"],["담당 파트","예: 기술 스택 소개 (3~6슬라이드)"],["PPT 페이지 수","예: 20슬라이드"],["시연 포함 여부","포함 / 미포함"]],
    deliverable:  [["산출물 종류","예: 최종 보고서, 제안서"],["제출 형식","예: PDF, DOCX"],["포함 항목","예: 목차, 결론, 부록"],["제출 마감","예: 12.28 23:59"]],
    operation:    [["제출처","예: 공모전 홈페이지, 교수 이메일"],["제출 파일","예: 보고서.pdf, 발표.pptx"],["마감 시간","예: 12.28 23:59"],["제출 상태","미제출 / 제출 완료"]],
    planning:     [["기획 목적","예: 핵심 기능 범위 확정"],["사용자 시나리오","예: 예약 → 결제 → 완료"],["연결된 기능","예: 예약 모듈, 결제 모듈"]],
    research:     [["조사 주제","예: 경쟁 서비스 벤치마킹"],["참고 자료","논문/기사 링크"],["핵심 인사이트","조사에서 발견한 핵심 내용"]],
    "ux-ui":      [["화면 이름","설계할 화면명"],["사용자 플로우","예: 로그인 → 예약 → 결제"],["Figma 링크","https://figma.com/..."]],
    design:       [["디자인 유형","예: PPT 디자인, 로고"],["색상/폰트 가이드","예: Primary #3B5BDB, Inter"],["참고 이미지","예: Dribbble 링크"]],
    other:        [["결과물","이 업무에서 생성할 파일이나 결과물"],["완료 기준 보완","추가 완료 기준"],["참고 자료","관련 링크 또는 파일"]],
  };

  // ── category-specific detail panel fields ───────────────────────────────────
  const getCatDetailFields = (taskId: string, cat: string): [string, string][] => {
    const e: Record<string, string> = {};
    switch (cat) {
      case "frontend":     return [["화면",e.screen??"—"],["컴포넌트",e.components??"—"],["API",e.api??"—"],["Figma",e.figma??"—"],["반응형",e.responsive??"—"],["PR",e.pr??"—"]];
      case "backend":      return [["Method",e.method??"—"],["Endpoint",e.endpoint??"—"],["인증",e.auth??"—"],["연결 DB",e.db??"—"],["테스트",e.test??"—"]];
      case "ai-ml":        return [["목적",e.purpose??"—"],["데이터",e.data??"—"],["모델",e.model??"—"],["지표",e.metric??"—"],["현재 성능",e.result??"—"],["추론 API",e.inferenceAPI??"—"]];
      case "qa":           return [["대상",e.target??"—"],["케이스",e.cases??"—"],["기대",e.expected??"—"],["실제",e.actual??"—"],["버그",e.bug??"—"]];
      case "docs":         return [["종류",e.docType??"—"],["범위",e.scope??"—"],["포함",e.includes??"—"],["참고",e.ref??"—"]];
      case "presentation": return [["주제",e.topic??"—"],["페이지",e.pages??"—"],["시연",e.demo??"—"],["초안",e.draft??"—"],["대본",e.script??"—"]];
      case "db":           return [["테이블",e.table??"—"],["ERD",e.erd??"—"],["이슈",e.issue??"—"],["인덱스",e.index??"—"],["목표",e.goal??"—"]];
      case "security":     return [["대상",e.target??"—"],["위험",e.risk??"—"],["취약점",e.findings??"—"],["인증",e.auth??"—"],["조치",e.remediation??"—"]];
      default:             return [["카테고리",getCat(cat).label],["정보","업무 상세 참고"]];
    }
  };

  const catAIBtn: Record<string, string> = {
    frontend:"QA 요청",backend:"API 명세 작성","ai-ml":"실험 결과 기록",
    qa:"버그 등록",docs:"AI 문장 정리",presentation:"발표 대본 생성",db:"스키마 변경 기록",default:"AI 추천 받기",
  };

  return (
    <div className="h-full flex overflow-hidden" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>

      {/* ── Kanban board ── */}
      <div className={`flex gap-4 p-5 overflow-x-auto transition-all ${selTask ? "flex-1 min-w-0" : "w-full"}`}>
        {BOARD_COLS.map(col => {
          const tasks = boardTasks.filter(t => t.status === col.id);
          return (
            <div key={col.id} className="w-[272px] shrink-0 flex flex-col rounded-xl" style={{ background: col.bg }}>
              {/* Column header */}
              <div className="flex items-center justify-between px-4 py-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  <span className="text-sm font-semibold" style={{ color: col.color }}>{col.label}</span>
                  <span className="text-[10px] font-mono bg-white rounded-full px-1.5 py-0.5 border border-border text-muted-foreground">{tasks.length}</span>
                </div>
                <button onClick={() => openModal(col.id)} className="hover:bg-white/60 rounded-md p-1 transition-colors">
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Task cards */}
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 min-h-0">
                {tasks.map(task => {
                  const catId = getTaskCategory(task);
                  const m = MEMBERS.find(me => me.id === task.assignee) ?? MEMBERS[0];
                  const isSelected = selId === task.id;
                  const hasCode = ["frontend","backend","ai-ml","db","github","devops"].includes(catId);
                  return (
                    <div key={task.id}
                      onClick={() => { setSelId(task.id === selId ? null : task.id); setPanelTab("info"); }}
                      className={`bg-card rounded-xl p-3 border cursor-pointer transition-all hover:shadow-md ${isSelected ? "border-blue-400 shadow-md ring-1 ring-blue-200" : "border-border shadow-sm hover:border-slate-300"}`}>
                      {/* Cat tag + ID */}
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <CatTag catId={catId} />
                        <span className="font-mono text-[9px] text-muted-foreground">{task.id}</span>
                      </div>
                      {/* Title */}
                      <div className="text-[11px] font-semibold text-foreground mb-2.5 leading-snug">{task.title}</div>
                      {/* Priority + due + avatar */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1">
                          <PriorityBadge priority={task.priority} />
                          {task.status === "blocked" && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-600">블로커</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">{task.dueDate}</span>
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: m.color }}>{m.initials}</div>
                        </div>
                      </div>
                      {/* Connection icons */}
                      <div className="flex items-center gap-1.5 pt-1.5 border-t border-border">
                        {hasCode && <GitCommit className="w-3 h-3 text-slate-300" />}
                        {hasCode && <GitPullRequest className="w-3 h-3 text-slate-300" />}
                        <FileAudio className="w-3 h-3 text-slate-300" />
                        {["docs","presentation","deliverable"].includes(catId) && <FileText className="w-3 h-3 text-slate-300" />}
                        <span className="text-[9px] text-muted-foreground ml-auto">{task.labels[0]}</span>
                      </div>
                    </div>
                  );
                })}
                {/* Add card button */}
                <button onClick={() => openModal(col.id)}
                  className="w-full py-2 text-[11px] font-medium text-muted-foreground border border-dashed border-border rounded-xl hover:bg-white/60 hover:border-slate-300 transition-all flex items-center justify-center gap-1">
                  <Plus className="w-3 h-3" />업무 추가
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Detail panel ── */}
      {selTask && (() => {
        const m = MEMBERS.find(me => me.id === selTask.assignee)!;
        const actions = STATUS_ACTIONS[selTask.status] ?? [];
        const catFields = getCatDetailFields(selTask.id, taskCat);
        const aiBtn = catAIBtn[taskCat] ?? catAIBtn["default"];
        return (
          <div className="w-[370px] shrink-0 bg-card border-l border-border flex flex-col h-full overflow-hidden">
            {/* Panel header */}
            <div className="flex items-start gap-2 p-4 border-b border-border">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  <CatTag catId={taskCat} />
                  <StatusBadge2 status={selTask.status} />
                  <PriorityBadge priority={selTask.priority} />
                </div>
                <div className="text-sm font-bold text-foreground leading-snug">{selTask.title}</div>
                <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{selTask.id}</div>
              </div>
              <button onClick={() => deleteTask(selTask.id)} title="업무 삭제" className="p-1.5 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
              <button onClick={() => setSelId(null)} className="p-1.5 hover:bg-muted rounded-lg transition-colors shrink-0">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Status actions */}
            <div className="px-4 py-3 border-b border-border shrink-0">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">빠른 액션</div>
              <div className="flex flex-wrap gap-1.5">
                {actions.map(a => {
                  const Icon = a.icon;
                  const style = a.primary
                    ? { background: "linear-gradient(135deg,#3B5BDB,#4F6EF7)", color: "white" }
                    : a.danger
                    ? { background: "#FEF2F2", color: "#EF4444", border: "1px solid #FECACA" }
                    : undefined;
                  return (
                    <button key={a.label}
                      onClick={() => a.nextStatus && updateTaskStatus(selTask.id, a.nextStatus)}
                      disabled={!a.nextStatus}
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${!style ? "border border-border bg-card text-foreground hover:bg-muted" : ""}`}
                      style={style}>
                      <Icon className="w-3 h-3" />{a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border shrink-0">
              {(["info","cat","activity","ai"] as const).map(tab => {
                const labels = { info:"기본 정보", cat:"카테고리", activity:"활동", ai:"AI 추천" };
                return (
                  <button key={tab} onClick={() => setPanelTab(tab)}
                    className={`flex-1 text-[11px] font-semibold py-2.5 border-b-2 transition-colors ${panelTab === tab ? "border-blue-500 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* ─ info tab ─ */}
              {panelTab === "info" && (
                <>
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">담당 정보</div>
                    <div className="space-y-2">
                      {[
                        ["담당자", <select value={selTask.assignee} onChange={e => updateTaskAssignee(selTask.id, e.target.value)}
                          className="text-xs font-medium text-foreground bg-transparent border border-border rounded-lg px-2 py-1 outline-none focus:border-blue-400">
                          {MEMBERS.map(mem => <option key={mem.id} value={mem.id}>{mem.name} ({mem.role})</option>)}
                        </select>],
                        ["마감일", <input value={selTask.dueDate} onChange={e => updateTaskDueDate(selTask.id, e.target.value)} placeholder="MM.DD"
                          className="text-xs font-semibold text-foreground bg-transparent border border-border rounded-lg px-2 py-1 outline-none focus:border-blue-400 w-20" />],
                        ["생성",    <span className="text-xs text-muted-foreground">{selTask.labels.includes("회의록 AI") ? "회의록 AI" : "직접 생성"}</span>],
                      ].map(([label, value], i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-14 shrink-0">{label as string}</span>
                          <div className="flex-1">{value as React.ReactNode}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">레이블</div>
                    <div className="flex flex-wrap gap-1">{selTask.labels.map(l => <LabelBadge key={l} label={l} />)}</div>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">완료 기준</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">담당자 자체 검수 후 팀장 최종 승인 시 완료 처리</p>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">GitHub 연결</div>
                    <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted border border-border">
                      <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-mono text-foreground">feature/{selTask.id.toLowerCase()}</span>
                    </div>
                  </div>
                  {/* Checklist */}
                  <div className="pt-2 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">체크리스트</div>
                    {[["설계 문서 확인",true],["구현 완료",selTask.status==="done"],["코드 리뷰 완료",selTask.status==="done"],["QA 통과",false]].map(([label, done]) => (
                      <div key={label as string} className="flex items-center gap-2 py-1">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${done ? "bg-emerald-500 border-emerald-500" : "border-border"}`}>
                          {done && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className={`text-xs ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>{label as string}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ─ cat tab ─ */}
              {panelTab === "cat" && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <CatTag catId={taskCat} />
                    <span className="text-sm font-bold text-foreground">{catDef.label} 전용 정보</span>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3 space-y-2.5 mb-3">
                    {catFields.map(([label, value]) => (
                      <div key={label} className="flex items-start gap-2">
                        <span className="text-[10px] text-muted-foreground w-16 shrink-0 pt-0.5">{label}</span>
                        <span className="text-xs font-medium text-foreground flex-1 break-words leading-relaxed">{value}</span>
                      </div>
                    ))}
                  </div>
                  <button className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-xl border border-purple-200 hover:opacity-90 transition-opacity"
                    style={{ background:"rgba(112,72,232,0.08)", color:"#7048E8" }}>
                    <Sparkles className="w-3.5 h-3.5" />{aiBtn}
                  </button>
                </div>
              )}

              {/* ─ activity tab ─ */}
              {panelTab === "activity" && (
                <div className="space-y-3">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">활동 기록</div>
                  {[
                    { actor:"김민준",  time:"3시간 전", msg:`상태를 '${selTask.status==="inprogress"?"진행 중":"완료"}'으로 변경`, type:"status" },
                    { actor:"회의록 AI", time:"어제",   msg:"6차 회의에서 이 업무가 자동 생성되었습니다.", type:"ai" },
                    { actor:"박지수",  time:"어제",     msg:"초안 검토 완료, 피드백 첨부했습니다.", type:"comment" },
                    { actor:"이서연",  time:"2일 전",   msg:"담당자를 '김민준'으로 변경했습니다.", type:"status" },
                  ].map((a, i) => {
                    const actorM = MEMBERS.find(me => me.name === a.actor);
                    return (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 mt-0.5"
                          style={{ background: a.type==="ai" ? "#7048E8" : actorM?.color ?? "#8892A4" }}>
                          {a.actor==="회의록 AI" ? "AI" : a.actor[0]}
                        </div>
                        <div>
                          <span className="text-[11px] font-semibold text-foreground">{a.actor}</span>
                          <span className="text-[10px] text-muted-foreground ml-1.5">{a.time}</span>
                          <div className="text-xs text-muted-foreground mt-0.5">{a.msg}</div>
                        </div>
                      </div>
                    );
                  })}
                  {/* Comment input */}
                  <div className="pt-2 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">코멘트 작성</div>
                    <div className="flex gap-2">
                      <textarea value={newComment} onChange={e => setNewComment(e.target.value)} rows={2}
                        placeholder="팀원에게 피드백이나 코멘트를 남기세요..."
                        className="flex-1 text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
                      <button onClick={() => setNewComment("")} className="self-end p-2 rounded-lg text-white shrink-0" style={{ background:"var(--primary)" }}>
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ─ AI tab ─ */}
              {panelTab === "ai" && (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl border border-purple-200" style={{ background:"rgba(112,72,232,0.05)" }}>
                    <div className="flex items-center gap-1.5 mb-1.5"><Sparkles className="w-3.5 h-3.5" style={{ color:"#7048E8" }} /><span className="text-xs font-semibold text-foreground">AI 업무 요약</span></div>
                    <p className="text-xs text-muted-foreground leading-relaxed">이 업무는 핵심 기능 개발 마일스톤의 일부입니다. 현재 {selTask.status==="inprogress"?"진행 중":selTask.status==="blocked"?"블로커 상태":selTask.status==="done"?"완료":"대기 중"}이며 마감까지 8일 남았습니다.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                    <div className="text-xs font-semibold text-blue-700 mb-1.5">💡 다음 액션 추천</div>
                    <ul className="text-xs text-blue-800 space-y-1 leading-relaxed">
                      <li>• {catDef.id==="frontend"?"Figma 설계를 먼저 확인하고 컴포넌트 구조를 설계하세요":catDef.id==="backend"?"API 명세를 먼저 작성하고 팀원과 공유하세요":catDef.id==="ai-ml"?"데이터 품질을 먼저 확인 후 모델 학습을 시작하세요":"담당자에게 현재 진행 상황을 요청하세요"}</li>
                      <li>• PR 생성 전 팀장에게 코드 리뷰 요청을 먼저 보내세요</li>
                    </ul>
                  </div>
                  {selTask.status !== "done" && (
                    <div className={`p-3 rounded-xl border ${selTask.status==="blocked"?"bg-red-50 border-red-200":"bg-amber-50 border-amber-200"}`}>
                      <div className={`text-xs font-semibold mb-1 ${selTask.status==="blocked"?"text-red-700":"text-amber-700"}`}>{selTask.status==="blocked"?"🚨 블로커 위험":"⚠ 지연 위험 분석"}</div>
                      <p className={`text-xs leading-relaxed ${selTask.status==="blocked"?"text-red-800":"text-amber-800"}`}>
                        {selTask.status==="blocked"?"현재 블로커 상태로 연결 업무에 지연이 발생할 수 있습니다. 오늘 내 해결이 필요합니다.":"현재 속도 기준 정상 진행 중입니다. 마감 전에 완료될 가능성이 높습니다."}
                      </p>
                    </div>
                  )}
                  <button className="w-full py-2.5 text-xs font-semibold rounded-xl border border-purple-200 flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                    style={{ background:"rgba(112,72,232,0.1)", color:"#7048E8" }}>
                    <Sparkles className="w-3.5 h-3.5" />체크리스트 자동 생성
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Add task modal ── */}
      {showModal && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setShowModal(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>

              {/* Stepper header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-3 overflow-x-auto">
                  {["카테고리 선택","기본 정보","추가 정보","생성 완료"].map((s, i) => (
                    <div key={s} className="flex items-center gap-2 shrink-0">
                      {i > 0 && <div className={`w-8 h-0.5 rounded ${i <= step ? "bg-blue-400" : "bg-border"}`} />}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < step ? "bg-emerald-500 text-white" : i === step ? "text-white" : "bg-muted text-muted-foreground"}`}
                        style={i === step ? { background:"var(--primary)" } : {}}>
                        {i < step ? "✓" : i + 1}
                      </div>
                      <span className={`text-xs font-semibold whitespace-nowrap ${i === step ? "text-foreground" : i < step ? "text-emerald-600" : "text-muted-foreground"}`}>{s}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors ml-4 shrink-0"><X className="w-5 h-5 text-muted-foreground" /></button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto p-6">

                {/* Step 0: Category */}
                {step === 0 && (
                  <div>
                    <h2 className="text-lg font-bold text-foreground mb-0.5">카테고리를 선택하세요</h2>
                    <p className="text-sm text-muted-foreground mb-4">업무 유형에 맞는 카테고리를 선택하면 관련 입력 항목이 자동으로 구성됩니다.</p>
                    <div className="grid grid-cols-3 gap-2">
                      {CATEGORIES.map(cat => {
                        const Icon = cat.icon; const sel = selCat === cat.id;
                        return (
                          <button key={cat.id} onClick={() => setSelCat(cat.id)}
                            className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all hover:shadow-sm ${sel ? "shadow-sm" : "border-border hover:border-slate-300"}`}
                            style={sel ? { borderColor:cat.color, background:cat.bg } : {}}>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background:sel ? cat.bg : "#F4F6FA" }}>
                              <Icon className="w-4 h-4" style={{ color:cat.color }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-foreground leading-tight">{cat.label}</div>
                              <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">{cat.desc}</div>
                            </div>
                            {sel && <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background:cat.color }}><Check className="w-2.5 h-2.5 text-white" /></div>}
                          </button>
                        );
                      })}
                    </div>
                    {selCat === "other" && (
                      <div className="mt-3">
                        <input value={customCat} onChange={e => setCustomCat(e.target.value)} placeholder="카테고리명을 직접 입력하세요 (예: 하드웨어, 영상 편집)"
                          className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                      </div>
                    )}
                  </div>
                )}

                {/* Step 1: Common fields */}
                {step === 1 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4"><CatTag catId={selCat} /><h2 className="text-lg font-bold text-foreground">기본 업무 정보</h2></div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-foreground block mb-1.5">업무명 <span className="text-red-500">*</span></label>
                        <input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder={`${getCat(selCat).label} 관련 업무명`}
                          className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-foreground block mb-1.5">업무 설명</label>
                        <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={3} placeholder="업무의 목적과 범위를 간략히 설명하세요"
                          className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">담당자</label>
                          <select value={fAssignee} onChange={e => setFAssignee(e.target.value)} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400">
                            {MEMBERS.map(m => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">마감일</label>
                          <input type="date" value={fDue} onChange={e => setFDue(e.target.value)} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">우선순위</label>
                          <div className="flex gap-1.5">
                            {(["low","medium","high"] as Priority[]).map(p => (
                              <button key={p} onClick={() => setFPriority(p)}
                                className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${fPriority===p ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border bg-card text-muted-foreground hover:border-slate-300"}`}>
                                {p==="low"?"낮음":p==="medium"?"중간":"높음"}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">초기 상태</label>
                          <select value={fStatus} onChange={e => setFStatus(e.target.value as TaskStatus)} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400">
                            <option value="todo">할 일</option><option value="inprogress">진행 중</option><option value="blocked">보류/블로커</option><option value="done">완료</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-foreground block mb-1.5">완료 기준</label>
                        <input value={fCriteria} onChange={e => setFCriteria(e.target.value)} placeholder="이 업무가 완료로 볼 수 있는 기준을 입력하세요"
                          className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Category-specific */}
                {step === 2 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4"><CatTag catId={selCat} /><h2 className="text-lg font-bold text-foreground">카테고리 전용 정보</h2></div>
                    <div className="space-y-4">
                      {(CAT_MODAL_FIELDS[selCat] ?? CAT_MODAL_FIELDS["other"]).map(([label, placeholder]) => (
                        <div key={label}>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">{label}</label>
                          <input placeholder={placeholder} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 p-3.5 rounded-xl border border-purple-200 flex items-center justify-between" style={{ background:"rgba(112,72,232,0.05)" }}>
                      <div className="text-xs text-purple-800"><span className="font-semibold">AI 추천:</span> 체크리스트와 완료 기준을 자동으로 생성해드릴 수 있어요.</div>
                      <button className="text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 hover:opacity-80 transition-opacity" style={{ background:"rgba(112,72,232,0.15)", color:"#7048E8" }}><Sparkles className="w-3 h-3" />자동 생성</button>
                    </div>
                  </div>
                )}

                {/* Step 3: Done */}
                {step === 3 && (
                  <div className="flex flex-col items-center text-center py-10">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background:"linear-gradient(135deg,#10B981,#059669)" }}>
                      <CheckCircle2 className="w-8 h-8 text-white" />
                    </div>
                    <div className="text-xl font-bold text-foreground mb-2">업무가 생성되었습니다!</div>
                    <p className="text-sm text-muted-foreground mb-2"><CatTag catId={selCat} /> 카테고리로 등록되었습니다.</p>
                    <p className="text-sm font-semibold text-foreground mb-6">"{fTitle || "새 업무"}"</p>
                    <div className="flex gap-3">
                      <button onClick={() => setShowModal(false)} className="px-5 py-2 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors">보드로 돌아가기</button>
                      <button onClick={() => { setStep(0); setSelCat(""); setFTitle(""); setFDesc(""); setFCriteria(""); }}
                        className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity" style={{ background:"var(--primary)" }}>+ 업무 더 추가</button>
                    </div>
                  </div>
                )}

              </div>

              {/* Modal footer */}
              {step < 3 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                  <button onClick={() => step===0 ? setShowModal(false) : setStep(step-1)}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors">
                    <ArrowLeft className="w-4 h-4" />{step===0?"취소":"이전"}
                  </button>
                  <button onClick={() => { if (step === 2) handleCreateTask(); setStep(step+1); }}
                    disabled={(step===0 && !selCat) || (step===1 && !fTitle.trim())}
                    className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 hover:opacity-90 transition-opacity"
                    style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                    {step===2?"업무 생성 완료":"다음 단계"}<ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── meetings ─────────────────────────────────────────────────────────────────
type UploadFlow = null | "modal" | "analyzing" | "results" | "review" | "done";
type UploadType = null | "document" | "audio" | "video";

interface GenTodo {
  id: string; title: string; desc: string; category: string;
  assignee: string; dueDate: string; priority: Priority; basis: string; assigned: boolean;
  source: "MEETING_AI" | "MANUAL" | "LEADER_MANUAL";
}

const DOCUMENT_ANALYZE_STAGES = [
  "파일 업로드 완료", "문서 텍스트 추출 중",
  "회의 내용 분석 중", "핵심 결정사항 추출 중",
  "업무 자동 생성 중", "역할 분배 생성 중",
];

const AUDIO_ANALYZE_STAGES = [
  "파일 업로드 완료", "음성 변환 중", "텍스트 정리 중",
  "회의 내용 분석 중", "핵심 결정사항 추출 중",
  "업무 자동 생성 중", "역할 분배 생성 중",
];

const VIDEO_ANALYZE_STAGES = [
  "파일 업로드 완료", "영상 음성 트랙 추출 중", "음성 변환 중",
  "회의 내용 분석 중", "핵심 결정사항 추출 중",
  "업무 자동 생성 중", "역할 분배 생성 중",
];

const getAnalyzeStages = (type: UploadType): string[] => {
  if (type === "audio") return AUDIO_ANALYZE_STAGES;
  if (type === "video") return VIDEO_ANALYZE_STAGES;
  return DOCUMENT_ANALYZE_STAGES;
};

const AI_CATEGORY_TO_BOARD: Record<string, CatId> = {
  PLANNING: "planning",
  RESEARCH: "research",
  UX: "ux-ui",
  UI: "ux-ui",
  DESIGN: "design",
  FRONTEND: "frontend",
  BACKEND: "backend",
  AI: "ai-ml",
  ML: "ai-ml",
  STT: "ai-ml",
  RAG: "ai-ml",
  DATA: "data",
  DATABASE: "db",
  DB: "db",
  DEVOPS: "devops",
  GITHUB: "github",
  DASHBOARD: "frontend",
  DOCUMENT: "docs",
  DOCS: "docs",
  PRESENTATION: "presentation",
  QA: "qa",
  SECURITY: "security",
  DELIVERABLE: "deliverable",
  OPERATION: "operation",
  ETC: "other",
};

const mapAiPriority = (priority: string): Priority => {
  if (priority === "HIGH") return "high";
  if (priority === "LOW") return "low";
  return "medium";
};

const formatAiDueDate = (dueDate: string | null) => {
  if (!dueDate) return "미정";
  const [, month, day] = dueDate.split("-");
  return month && day ? `${month}.${day}` : dueDate;
};

const resolveAiAssignee = (candidate: string) => {
  const normalized = candidate.trim();
  const member = MEMBERS.find(m => normalized.includes(m.name) || m.name.includes(normalized));
  return member?.id ?? "";
};

const buildGeneratedTodos = (result: MeetingAiResult): GenTodo[] =>
  result.todos.map((todo, index) => {
    const assignee = resolveAiAssignee(todo.assignee_candidate);
    return {
      id: `GT-${String(index + 1).padStart(2, "0")}`,
      title: todo.title,
      desc: todo.description,
      category: AI_CATEGORY_TO_BOARD[todo.category.toUpperCase()] ?? "other",
      assignee,
      dueDate: formatAiDueDate(todo.due_date),
      priority: mapAiPriority(todo.priority),
      basis: todo.assignee_candidate ? `회의록 후보 담당자: ${todo.assignee_candidate}` : "회의록 AI 분석 결과",
      assigned: Boolean(assignee),
      source: "MEETING_AI" as const,
    };
  });

const buildRiskCards = (risks: string[]) =>
  risks.map((text, index) => ({
    level: index === 0 ? "high" : "medium",
    text,
    suggestion: index === 0
      ? "팀장 검토 후 담당자와 마감일을 먼저 확정하는 것을 권장합니다."
      : "관련 업무의 우선순위와 일정 여유를 재점검하세요.",
  }));

const getTodayIsoDate = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const stripFileExtension = (fileName: string) => fileName.replace(/\.[^/.]+$/, "");
const formatDisplayDate = (date: string) => (date || getTodayIsoDate()).replace(/-/g, ".");

const parseDueDateToDate = (dueDate: string): Date | null => {
  const match = dueDate.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidate = new Date(today.getFullYear(), month - 1, day);
  const diffDays = Math.round((candidate.getTime() - today.getTime()) / 86400000);
  if (diffDays < -180) candidate.setFullYear(candidate.getFullYear() + 1);
  else if (diffDays > 180) candidate.setFullYear(candidate.getFullYear() - 1);
  return candidate;
};

const getDaysLeft = (dueDate: string): number | null => {
  const date = parseDueDateToDate(dueDate);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
};

type Urgency = "overdue" | "today" | "3day" | "week" | "normal";
const getUrgencyFromDaysLeft = (daysLeft: number | null): Urgency => {
  if (daysLeft === null) return "normal";
  if (daysLeft < 0) return "overdue";
  if (daysLeft === 0) return "today";
  if (daysLeft <= 3) return "3day";
  if (daysLeft <= 7) return "week";
  return "normal";
};

const formatDaysLeft = (daysLeft: number | null): string => {
  if (daysLeft === null) return "미정";
  if (daysLeft < 0) return `${Math.abs(daysLeft)}일 지남`;
  return `D-${daysLeft}`;
};

function MeetingsView({ onGoBoard }: { onGoBoard?: () => void }) {
  const initialMeetingFlow = (getDesignParam("meetingFlow") as UploadFlow) ?? null;
  const initialUploadType = (getDesignParam("uploadType") as UploadType) ?? null;
  const [meetings, setMeetings] = useState<Meeting[]>(getStoredMeetings);
  const [selected, setSelected] = useState<string|null>(getDesignParam("meetingSelected"));
  const [uploadFlow, setUploadFlow] = useState<UploadFlow>(initialMeetingFlow);
  const [uploadType, setUploadType] = useState<UploadType>(initialUploadType);
  const [modalStep, setModalStep] = useState(getDesignStep("meetingModalStep"));
  const [analyzeStage, setAnalyzeStage] = useState(initialMeetingFlow === "analyzing" ? 4 : 0);
  const [analyzeProgress, setAnalyzeProgress] = useState(initialMeetingFlow === "analyzing" ? 62 : 0);
  const [meetTitle, setMeetTitle] = useState("");
  const [meetDate, setMeetDate] = useState(getTodayIsoDate());
  const [meetKind, setMeetKind] = useState("정기회의");
  const [partIds, setPartIds] = useState<string[]>(["1","2","3","4"]);
  const [analysisResult, setAnalysisResult] = useState<MeetingAiResult | null>(null);
  const [selTodos, setSelTodos] = useState<string[]>([]);
  const [todoAssignees, setTodoAssignees] = useState<Record<string,string>>({});
  const [todoDueDates, setTodoDueDates] = useState<Record<string,string>>({});
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [uploadFileName, setUploadFileName] = useState(getDesignParam("uploadFile") ?? "");
  const [uploadFileSize, setUploadFileSize] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysisSource, setAnalysisSource] = useState<"fastapi"|"spring-fallback"|null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"summary"|"todos"|"risks">("summary");
  const [manualTodos, setManualTodos] = useState<GenTodo[]>([]);
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoDesc, setNewTodoDesc] = useState("");
  const [newTodoCategory, setNewTodoCategory] = useState<CatId>("other");
  const [newTodoAssignee, setNewTodoAssignee] = useState(MEMBERS[0].id);
  const [newTodoDueDate, setNewTodoDueDate] = useState("");
  const [newTodoPriority, setNewTodoPriority] = useState<Priority>("medium");
  const [newTodoError, setNewTodoError] = useState<string | null>(null);
  const [saveMeetingMessage, setSaveMeetingMessage] = useState<string | null>(null);
  const [originalViewMessage, setOriginalViewMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const analyzeStages = getAnalyzeStages(uploadType);
  const canAddManualTodo = CURRENT_USER_ROLE === "leader";

  // Simulate analysis progress
  useEffect(() => {
    if (uploadFlow !== "analyzing" || isDesignCapture()) return;
    let prog = 0; let stg = 0;
    const iv = setInterval(() => {
      prog = Math.min(prog + 1.5, 100);
      stg = Math.min(Math.floor(prog / (100 / analyzeStages.length)), analyzeStages.length - 1);
      setAnalyzeStage(stg); setAnalyzeProgress(Math.round(prog));
      if (prog >= 100) { clearInterval(iv); setTimeout(() => { setUploadFlow("results"); setPanelTab("summary"); }, 600); }
    }, 70);
    return () => clearInterval(iv);
  }, [uploadFlow, analyzeStages.length]);

  const meeting = meetings.find(m => m.id === selected);

  // ── Upload type metadata ─────────────────────────────────────────────────────
  const UPLOAD_TYPES = [
    { id:"document", label:"문서 업로드", desc:"PDF, Word, TXT, HWP 등 회의록 문서", icon:FileText, accept:".pdf,.doc,.docx,.txt,.hwp", color:"#3B5BDB", bg:"rgba(59,91,219,0.1)", note:"텍스트를 추출해 AI가 분석합니다." },
    { id:"audio",    label:"음성파일 업로드", desc:"mp3, wav, m4a 등 녹음파일", icon:Radio,    accept:".mp3,.wav,.m4a,.ogg", color:"#7048E8", bg:"rgba(112,72,232,0.1)", note:"음성을 텍스트로 변환한 뒤 분석합니다." },
    { id:"video",    label:"영상파일 업로드", desc:"mp4, mov, Zoom/Discord 녹화본", icon:Film,  accept:".mp4,.mov,.avi,.webm", color:"#10B981", bg:"rgba(16,185,129,0.1)", note:"음성 트랙을 추출해 분석합니다." },
  ] as const;

  const MEET_KINDS = ["정기회의","중간점검","발표준비","개발회의","기타"];

  const getAssignee = (todo: GenTodo): string => todoAssignees[todo.id] ?? todo.assignee;
  const getDueDate = (todo: GenTodo): string => todoDueDates[todo.id] ?? todo.dueDate;

  const generatedTodos = analysisResult ? buildGeneratedTodos(analysisResult) : [];
  const riskCards = analysisResult ? buildRiskCards(analysisResult.risks) : [];
  const unassignedCount = generatedTodos.filter(t => !getAssignee(t)).length;
  const assignedCount = generatedTodos.filter(t => Boolean(getAssignee(t))).length;
  const nextActions = generatedTodos.slice(0, 3).map(t => t.title);
  const reviewTodos = [...generatedTodos, ...manualTodos];

  const handleAddManualTodo = () => {
    if (!newTodoTitle.trim() || !newTodoAssignee || !newTodoDueDate) {
      setNewTodoError("업무명, 담당자, 마감일은 필수입니다.");
      return;
    }
    const todo: GenTodo = {
      id: `MANUAL-${Date.now()}`,
      title: newTodoTitle.trim(),
      desc: newTodoDesc.trim(),
      category: newTodoCategory,
      assignee: newTodoAssignee,
      dueDate: formatAiDueDate(newTodoDueDate),
      priority: newTodoPriority,
      basis: "팀장이 직접 추가",
      assigned: true,
      source: canAddManualTodo ? "LEADER_MANUAL" : "MANUAL",
    };
    setManualTodos(prev => [...prev, todo]);
    setSelTodos(prev => [...prev, todo.id]);
    setShowAddTodo(false);
    setNewTodoTitle(""); setNewTodoDesc(""); setNewTodoCategory("other");
    setNewTodoAssignee(MEMBERS[0].id); setNewTodoDueDate(""); setNewTodoPriority("medium");
    setNewTodoError(null);
  };

  const handleSaveMeeting = () => {
    if (!analysisResult) return;
    const meetingId = meeting?.id ?? selected ?? `local-${Date.now()}`;
    const record: SavedMeetingRecord = {
      meetingId,
      title: meetTitle,
      meetingDate: meetDate,
      meetingKind: meetKind,
      participants: partIds.map(id => MEMBERS.find(m => m.id === id)?.name ?? id),
      originalFileName: selectedFile?.name ?? uploadFileName ?? "",
      fileType: uploadType,
      summary: analysisResult.summary,
      decisions: analysisResult.decisions,
      risks: analysisResult.risks,
      actionItems: reviewTodos,
      createdAt: new Date().toISOString(),
      source: "MEETING_AI",
    };
    const next = [record, ...getSavedMeetings().filter(item => item.meetingId !== meetingId)];
    saveSavedMeetings(next);
    setSaveMeetingMessage("회의록이 저장되었습니다.");
    setTimeout(() => setSaveMeetingMessage(null), 2500);
  };

  const handleViewOriginal = () => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setOriginalViewMessage("원본 파일 URL이 없습니다.");
    setTimeout(() => setOriginalViewMessage(null), 2500);
  };

  const handleExportPdf = () => {
    if (!analysisResult) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=800,height=1000");
    if (!printWindow) return;
    const participantsText = partIds.map(id => MEMBERS.find(m => m.id === id)?.name ?? id).join(", ");
    const decisionsHtml = analysisResult.decisions.map(d => `<li>${escapeHtml(d)}</li>`).join("");
    const risksHtml = analysisResult.risks.map(r => `<li>${escapeHtml(r)}</li>`).join("");
    const todosHtml = reviewTodos.map(t => {
      const assigneeName = MEMBERS.find(m => m.id === getAssignee(t))?.name ?? "미배정";
      return `<li>${escapeHtml(t.title)} - ${escapeHtml(assigneeName)} (${escapeHtml(getDueDate(t))})</li>`;
    }).join("");
    const docTitle = `회의록_${meetTitle}_${meetDate}`;
    printWindow.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(docTitle)}</title>
      <style>
        body { font-family: 'Inter','Noto Sans KR',sans-serif; padding: 32px; color:#1a1a1a; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .meta { font-size: 12px; color:#666; margin-bottom: 20px; }
        h2 { font-size: 14px; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        ul { margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.6; }
        p { font-size: 13px; line-height: 1.6; }
      </style>
      </head><body>
        <h1>${escapeHtml(meetTitle)}</h1>
        <div class="meta">${escapeHtml(meetDate)} · ${escapeHtml(meetKind)} · 참석자 ${escapeHtml(participantsText)}</div>
        <h2>회의 요약</h2><p>${escapeHtml(analysisResult.summary)}</p>
        <h2>핵심 결정사항</h2><ul>${decisionsHtml || "<li>결정사항이 없습니다.</li>"}</ul>
        <h2>생성된 To-Do</h2><ul>${todosHtml || "<li>생성된 업무가 없습니다.</li>"}</ul>
        <h2>위험 요소</h2><ul>${risksHtml || "<li>감지된 위험 요소가 없습니다.</li>"}</ul>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    const mb = file.size / (1024 * 1024);
    setSelectedFile(file);
    setUploadFileName(file.name);
    setUploadFileSize(mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`);
    setAnalysisError(null);
    if (!meetTitle.trim()) setMeetTitle(stripFileExtension(file.name));
  };

  const startAnalysis = () => {
    if (!selectedFile || !uploadType) {
      setAnalysisError("분석할 회의록 파일을 먼저 업로드해주세요.");
      return;
    }
    const title = meetTitle.trim() || stripFileExtension(selectedFile.name);
    setMeetTitle(title);
    setAnalysisResult(null);
    setSelTodos([]);
    setTodoAssignees({});
    setTodoDueDates({});
    setShowUnassigned(false);
    setAnalysisSource(null);
    setAnalysisError(null);
    setAnalyzeStage(0);
    setAnalyzeProgress(0);
    setUploadFlow("analyzing");

    void analyzeMeeting({
      projectId: "demo-project",
      file: selectedFile,
      title,
      meetingDate: meetDate,
      meetingKind: meetKind,
      sourceType: uploadType,
      participants: partIds.map(id => MEMBERS.find(member => member.id === id)?.name ?? id),
    }).then(response => {
      const apiTodos = buildGeneratedTodos(response.analysis);
      const source = response.analysisSource === "FASTAPI" ? "fastapi" : "spring-fallback";
      const analyzedMeeting: Meeting = {
        id: response.meetingId,
        title: response.analysis.meeting_meta.title || title,
        date: formatDisplayDate(response.analysis.meeting_meta.meeting_date || meetDate),
        duration: "분석 완료",
        status: "processed",
        summary: response.analysis.summary,
        decisions: response.analysis.decisions,
        todos: response.analysis.todos.map(todo => {
          const assignee = todo.assignee_candidate || "미배정";
          const due = todo.due_date ? ` (${todo.due_date.slice(5).replace("-", ".")})` : "";
          return `${assignee}: ${todo.title}${due}`;
        }),
        risks: response.analysis.risks,
        analysisSource: source,
      };
      setAnalysisResult(response.analysis);
      setSelTodos(apiTodos.map(t => t.id));
      setAnalysisSource(source);
      setMeetings(prev => {
        const next = [analyzedMeeting, ...prev.filter(item => item.id !== analyzedMeeting.id)];
        saveStoredMeetings(next);
        return next;
      });
      setSelected(analyzedMeeting.id);
    }).catch(() => {
      setAnalysisResult(null);
      setSelTodos([]);
      setAnalysisSource(null);
      setAnalysisError("분석 서버 연결에 실패했습니다. Spring Boot와 FastAPI 서버가 실행 중인지 확인한 뒤 다시 시도해주세요.");
    });
  };

  const registerSelectedTodos = () => {
    const now = Date.now();
    const selectedGeneratedTodos = reviewTodos.filter(todo => selTodos.includes(todo.id));
    const createdTasks: Task[] = selectedGeneratedTodos.map((todo, index) => {
      const cat = getCat(todo.category);
      const sourceLabel = todo.source === "MEETING_AI" ? "회의록 AI" : "직접 추가";
      return {
        id: `AI-${now}-${String(index + 1).padStart(2, "0")}`,
        title: todo.title,
        status: "todo",
        priority: todo.priority,
        assignee: getAssignee(todo) || MEMBERS[0].id,
        dueDate: getDueDate(todo),
        labels: [sourceLabel, cat.label],
      };
    });

    if (createdTasks.length > 0) {
      saveStoredTasks([...createdTasks, ...getStoredTasks()]);
    }
    setUploadFlow("done");
  };

  // ── Analyzing screen ────────────────────────────────────────────────────────
  const renderAnalyzing = () => (
    <div className="h-full flex items-center justify-center bg-background" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
      <div className="w-full max-w-lg px-6 text-center">
        {/* Spinner */}
        <div className="relative w-28 h-28 mx-auto mb-8">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
            <circle cx="56" cy="56" r="48" fill="none" stroke="#EEF1F8" strokeWidth="8" />
            <circle cx="56" cy="56" r="48" fill="none" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${(analyzeProgress / 100) * 301} 301`} stroke="url(#ag)" />
            <defs><linearGradient id="ag" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7048E8" /><stop offset="100%" stopColor="#4F6EF7" />
            </linearGradient></defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-foreground">{analyzeProgress}%</span>
            <span className="text-[10px] text-muted-foreground">분석 중</span>
          </div>
        </div>

        <div className="mb-2 text-xs font-mono text-muted-foreground">{uploadFileName || "업로드된 회의록"}</div>
        <h2 className="text-xl font-bold text-foreground mb-1">AI 분석 진행 중</h2>
        <p className="text-sm text-muted-foreground mb-8">잠시만 기다려주세요. 회의 내용을 분석하고 업무를 자동 생성합니다.</p>

        {/* Stage list */}
        <div className="space-y-2 text-left max-w-sm mx-auto">
          {analyzeStages.map((stage, i) => {
            const done = i < analyzeStage; const active = i === analyzeStage;
            return (
              <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${active ? "bg-blue-50 border border-blue-200" : done ? "opacity-60" : "opacity-30"}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-emerald-500" : active ? "border-2 border-blue-500" : "border-2 border-slate-300"}`}>
                  {done ? <Check className="w-3 h-3 text-white" /> : active ? <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> : null}
                </div>
                <span className={`text-xs font-medium ${active ? "text-blue-700" : done ? "text-emerald-700" : "text-muted-foreground"}`}>{stage}</span>
                {active && <div className="ml-auto flex gap-0.5">{[0,1,2].map(j => <div key={j} className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay:`${j*0.15}s` }} />)}</div>}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-8">약 20~40초 소요 · 분석이 완료되면 자동으로 이동합니다</p>
      </div>
    </div>
  );

  // ── Results screen ───────────────────────────────────────────────────────────
  const renderResults = () => {
    if (!analysisResult) {
      return (
        <div className="h-full flex items-center justify-center bg-background" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
          <div className="w-full max-w-md px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-5">
              {analysisError ? <AlertTriangle className="w-8 h-8 text-amber-500" /> : <Sparkles className="w-8 h-8 text-blue-500 animate-pulse" />}
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">{analysisError ? "분석을 완료하지 못했습니다" : "분석 결과를 불러오는 중"}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              {analysisError ?? "업로드한 회의록의 요약, 결정사항, To-Do, 위험요소를 정리하고 있습니다."}
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setUploadFlow("modal")} className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity" style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                다시 업로드
              </button>
              <button onClick={() => setUploadFlow(null)} className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors">
                회의록으로 돌아가기
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
    <div className="h-full flex overflow-hidden" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
      {/* Left: meeting list (mini) */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col bg-card">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-600">AI 분석 완료</span>
          </div>
          <div className="text-sm font-bold text-foreground leading-snug">{meetTitle}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{meetDate} · {meetKind}</div>
          <div className="flex -space-x-1.5 mt-2">
            {partIds.map(id => { const m = MEMBERS.find(me => me.id === id)!; return (
              <div key={id} title={m.name} className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-white text-[9px] font-bold" style={{ background:m.color }}>{m.initials}</div>
            ); })}
          </div>
        </div>
        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(["summary","todos","risks"] as const).map(tab => {
            const l = { summary:"요약", todos:"To-Do", risks:"위험" };
            return <button key={tab} onClick={() => setPanelTab(tab)} className={`flex-1 py-2.5 text-[11px] font-semibold border-b-2 transition-colors ${panelTab===tab ? "border-blue-500 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{l[tab]}</button>;
          })}
        </div>
        {/* Quick info */}
        <div className="p-4 space-y-2 text-xs text-muted-foreground border-b border-border">
          <div className="flex justify-between"><span>업로드 유형</span><span className="font-medium text-foreground">{UPLOAD_TYPES.find(u => u.id === uploadType)?.label ?? "문서 업로드"}</span></div>
          <div className="flex justify-between"><span>생성된 To-Do</span><span className="font-semibold text-blue-600">{generatedTodos.length}개</span></div>
          <div className="flex justify-between"><span>미배정 업무</span><span className="font-semibold text-amber-600">{unassignedCount}개</span></div>
          <div className="flex justify-between"><span>위험 요소</span><span className="font-semibold text-red-600">{riskCards.length}건</span></div>
        </div>
        {/* Actions */}
        <div className="p-4 space-y-2">
          <button onClick={() => setUploadFlow("review")}
            className="w-full py-2.5 text-sm font-semibold text-white rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
            <ListChecks className="w-4 h-4" />역할 분배 검토 →
          </button>
          <button onClick={handleSaveMeeting} className="w-full py-2 text-xs font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors flex items-center justify-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />회의록 저장
          </button>
          {saveMeetingMessage && <div className="text-[10px] text-emerald-600 text-center">{saveMeetingMessage}</div>}
          <button onClick={() => setUploadFlow(null)} className="w-full py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            닫기
          </button>
        </div>
      </div>

      {/* Right: results */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ AI 분석 완료</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${analysisSource === "fastapi" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                {analysisSource === "fastapi" ? "Spring/FastAPI 응답" : "Spring 분석 응답"}
              </span>
              <span className="text-[10px] text-muted-foreground">{meetDate}</span>
            </div>
            <h1 className="text-lg font-bold text-foreground">{meetTitle}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{meetKind} · 참석자 {partIds.length}명</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <button onClick={handleViewOriginal} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card rounded-lg hover:bg-muted transition-colors"><Eye className="w-3.5 h-3.5" />원본 보기</button>
              <button onClick={handleExportPdf} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card rounded-lg hover:bg-muted transition-colors"><FileText className="w-3.5 h-3.5" />PDF 저장</button>
            </div>
            {originalViewMessage && <div className="text-[10px] text-amber-600">{originalViewMessage}</div>}
          </div>
        </div>

        {/* Summary tab */}
        {panelTab === "summary" && (
          <div className="space-y-4">
            <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4" style={{ color:"var(--accent)" }} />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI 회의 요약</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{analysisResult.summary}</p>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <CheckCheck className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">핵심 결정사항</span>
              </div>
              <ul className="space-y-2.5">
                {analysisResult.decisions.map((d, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold text-emerald-600">{i + 1}</div>
                    <span className="text-sm text-foreground leading-relaxed">{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">다음 회의 전까지</div>
              <ul className="space-y-1.5">
                {(nextActions.length ? nextActions : ["담당자 검토 후 업무 보드에 등록"]).map((t, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                    <ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />{t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Todos tab */}
        {panelTab === "todos" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-foreground">생성된 To-Do <span className="text-muted-foreground font-normal">({generatedTodos.length}개)</span></div>
              <button onClick={() => setUploadFlow("review")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg hover:opacity-90"
                style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                <ListChecks className="w-3.5 h-3.5" />역할 분배 검토
              </button>
            </div>
            {generatedTodos.map(todo => {
              const assigneeId = getAssignee(todo);
              const m = MEMBERS.find(me => me.id === assigneeId);
              return (
                <div key={todo.id} className={`bg-card rounded-xl p-4 border shadow-sm ${!todo.assigned ? "border-amber-300" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CatTag catId={todo.category} />
                      {!todo.assigned && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">미배정</span>}
                    </div>
                    <PriorityBadge priority={todo.priority} />
                  </div>
                  <div className="text-sm font-semibold text-foreground mb-1">{todo.title}</div>
                  <div className="text-xs text-muted-foreground mb-2">{todo.desc}</div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      {m ? (
                        <div className="flex items-center gap-1"><div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background:m.color }}>{m.initials}</div><span className="text-muted-foreground">{m.name}</span></div>
                      ) : <span className="text-amber-600 font-medium">담당자 미배정</span>}
                    </div>
                    <span className="text-muted-foreground">마감 {todo.dueDate}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground">
                    근거: <span className="text-foreground">{todo.basis}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Risks tab */}
        {panelTab === "risks" && (
          <div className="space-y-4">
            {riskCards.map((r, i) => (
              <div key={i} className={`rounded-xl p-5 border ${r.level==="high" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                <div className="flex items-start gap-2 mb-2">
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${r.level==="high" ? "text-red-500" : "text-amber-500"}`} />
                  <div>
                    <span className={`text-[10px] font-bold mr-2 ${r.level==="high" ? "text-red-700" : "text-amber-700"}`}>{r.level==="high"?"🔴 즉시 대응":"🟡 주의"}</span>
                    <span className={`text-sm font-semibold ${r.level==="high" ? "text-red-900" : "text-amber-900"}`}>{r.text}</span>
                  </div>
                </div>
                <div className={`flex items-start gap-1.5 text-xs mt-2 ${r.level==="high" ? "text-red-700" : "text-amber-700"}`}>
                  <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />
                  <span><strong>AI 추천 대응:</strong> {r.suggestion}</span>
                </div>
              </div>
            ))}
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-1"><Sparkles className="w-3.5 h-3.5 text-blue-500" /><span className="text-xs font-semibold text-blue-700">AI 종합 제안</span></div>
              <p className="text-xs text-blue-800 leading-relaxed">핵심 키워드({analysisResult.keywords.slice(0, 4).join(", ")})를 기준으로 업무 우선순위를 정리하고, 미배정 업무는 팀장이 먼저 확정하는 것을 권장합니다.</p>
            </div>
          </div>
        )}
      </div>
    </div>
    );
  };

  // ── Review screen ────────────────────────────────────────────────────────────
  const renderReview = () => {
    const todos = showUnassigned ? reviewTodos.filter(t => !getAssignee(t)) : reviewTodos;
    const approvedCount = selTodos.length;
    return (
      <div className="h-full flex flex-col overflow-hidden" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
        {/* Header */}
        <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between mb-3">
            <div>
              <button onClick={() => setUploadFlow("results")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors group">
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />분석 결과로 돌아가기
              </button>
              <h1 className="text-xl font-bold text-foreground">역할 분배 검토</h1>
              <p className="text-sm text-muted-foreground mt-0.5">팀장이 확인하고 승인한 업무만 업무 보드에 등록됩니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowUnassigned(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${showUnassigned ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border bg-card text-muted-foreground hover:border-slate-300"}`}>
                <AlertTriangle className="w-3.5 h-3.5" />미배정만 보기 {showUnassigned && <span className="bg-amber-200 text-amber-800 px-1 rounded text-[10px]">{unassignedCount}</span>}
              </button>
              <button onClick={registerSelectedTodos}
                disabled={approvedCount === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                <CheckCircle2 className="w-4 h-4" />{approvedCount}개 업무 보드에 등록
              </button>
            </div>
          </div>

          {/* Summary chips */}
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">{generatedTodos.length}개 AI 생성</span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">{assignedCount}개 배정 완료</span>
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">{unassignedCount}개 미배정</span>
            {manualTodos.length > 0 && <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">{manualTodos.length}개 직접 추가</span>}
            <button onClick={() => setSelTodos(reviewTodos.map(t=>t.id))} className="ml-auto text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2">전체 선택</button>
            <button onClick={() => setSelTodos([])} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">전체 해제</button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-6 pb-24">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="pl-4 pr-2 py-3 w-8" />
                  {["ID","업무명","카테고리","담당자","마감일","우선순위","근거"].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {todos.map(todo => {
                  const checked = selTodos.includes(todo.id);
                  const assigneeId = getAssignee(todo);
                  const assigneeMember = MEMBERS.find(m => m.id === assigneeId);
                  const isUnassigned = !assigneeId;
                  return (
                    <tr key={todo.id} className={`hover:bg-muted/30 transition-colors ${isUnassigned ? "bg-amber-50/30" : ""}`}>
                      <td className="pl-4 pr-2 py-3">
                        <div onClick={() => setSelTodos(p => checked ? p.filter(x=>x!==todo.id) : [...p,todo.id])}
                          className={`w-4 h-4 rounded border cursor-pointer flex items-center justify-center transition-all ${checked ? "border-blue-500 bg-blue-500" : "border-border hover:border-blue-400"}`}>
                          {checked && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground">{todo.id}</td>
                      <td className="px-3 py-3 max-w-[180px]">
                        <div className="text-xs font-semibold text-foreground">{todo.title}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{todo.desc}</div>
                      </td>
                      <td className="px-3 py-3"><CatTag catId={todo.category} /></td>
                      <td className="px-3 py-3">
                        <select value={assigneeId} onChange={e => setTodoAssignees(p => ({ ...p, [todo.id]: e.target.value }))}
                          className={`text-xs rounded-lg border px-2 py-1.5 outline-none focus:border-blue-400 cursor-pointer ${isUnassigned ? "border-amber-300 bg-amber-50 text-amber-700" : "border-border bg-card text-foreground"}`}>
                          <option value="">⚠ 미배정</option>
                          {MEMBERS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={getDueDate(todo)}
                          onChange={e => setTodoDueDates(p => ({ ...p, [todo.id]: e.target.value }))}
                          className="text-xs rounded-lg border border-border bg-card px-2 py-1.5 outline-none focus:border-blue-400 w-16 text-center"
                        />
                      </td>
                      <td className="px-3 py-3"><PriorityBadge priority={todo.priority} /></td>
                      <td className="px-3 py-3 text-[10px] text-muted-foreground max-w-[120px] truncate" title={todo.basis}>{todo.basis}</td>
                      <td className="px-3 py-3">
                        <button className="p-1 hover:bg-muted rounded transition-colors"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add task */}
          {canAddManualTodo && (
            <div className="mt-3">
              {!showAddTodo && (
                <button onClick={() => setShowAddTodo(true)}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-blue-600 border border-dashed border-blue-300 rounded-xl hover:bg-blue-50 transition-colors">
                  <Plus className="w-3.5 h-3.5" />새 업무 직접 추가
                </button>
              )}
              {showAddTodo && (
                <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-foreground block mb-1.5">업무명 <span className="text-red-500">*</span></label>
                      <input value={newTodoTitle} onChange={e => setNewTodoTitle(e.target.value)} placeholder="업무명을 입력하세요"
                        className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-xs outline-none focus:border-blue-400" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-foreground block mb-1.5">설명</label>
                      <input value={newTodoDesc} onChange={e => setNewTodoDesc(e.target.value)} placeholder="업무 설명 (선택)"
                        className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-xs outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1.5">카테고리</label>
                      <select value={newTodoCategory} onChange={e => setNewTodoCategory(e.target.value as CatId)}
                        className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-xs outline-none focus:border-blue-400">
                        {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1.5">담당자 <span className="text-red-500">*</span></label>
                      <select value={newTodoAssignee} onChange={e => setNewTodoAssignee(e.target.value)}
                        className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-xs outline-none focus:border-blue-400">
                        {MEMBERS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1.5">마감일 <span className="text-red-500">*</span></label>
                      <input type="date" value={newTodoDueDate} onChange={e => setNewTodoDueDate(e.target.value)}
                        className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-xs outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1.5">우선순위</label>
                      <div className="flex gap-1.5">
                        {(["low","medium","high"] as Priority[]).map(p => (
                          <button key={p} type="button" onClick={() => setNewTodoPriority(p)}
                            className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg border transition-all ${newTodoPriority===p ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border bg-card text-muted-foreground"}`}>
                            {p==="low"?"낮음":p==="medium"?"중간":"높음"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {newTodoError && <div className="text-[11px] text-red-600">{newTodoError}</div>}
                  <div className="flex items-center gap-2 justify-end pt-1">
                    <button onClick={() => { setShowAddTodo(false); setNewTodoError(null); }} className="px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">취소</button>
                    <button onClick={handleAddManualTodo} className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg hover:opacity-90 transition-opacity" style={{ background:"var(--primary)" }}>추가</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Done screen ──────────────────────────────────────────────────────────────
  const renderDone = () => (
    <div className="h-full flex items-center justify-center bg-background" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
      <div className="text-center max-w-md px-6">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6" style={{ background:"linear-gradient(135deg,#10B981,#059669)" }}>
          <CheckCircle2 className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">업무 등록 완료!</h1>
        <p className="text-sm text-muted-foreground mb-2">{selTodos.length}개 업무가 업무 보드에 등록되었습니다.</p>
        <p className="text-xs text-muted-foreground mb-8">담당자별 할 일, 마일스톤 진행률, 대시보드가 자동으로 업데이트됩니다.</p>

        {/* Where registered */}
        <div className="grid grid-cols-2 gap-3 text-left mb-8">
          {[
            { icon:Columns3, label:"업무 보드", desc:"'할 일' 컬럼에 추가됨", color:"#3B5BDB" },
            { icon:Users, label:"담당자 할 일", desc:"개인 업무 목록에 반영", color:"#7048E8" },
            { icon:LayoutDashboard, label:"대시보드", desc:"전체 업무 수 업데이트", color:"#10B981" },
            { icon:Calendar, label:"캘린더", desc:"마감일 기반 일정 등록", color:"#F59E0B" },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-2.5 p-3 rounded-xl bg-card border border-border shadow-sm">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background:`${item.color}15` }}>
                  <Icon className="w-4 h-4" style={{ color:item.color }} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground">{item.label}</div>
                  <div className="text-[10px] text-muted-foreground">{item.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 justify-center">
          <button onClick={() => setUploadFlow(null)} className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors">
            회의록으로 돌아가기
          </button>
          <button onClick={() => { setUploadFlow(null); onGoBoard?.(); }} className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity" style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
            업무 보드 확인하기
          </button>
        </div>
      </div>
    </div>
  );

  // ── Early returns for full-screen states ─────────────────────────────────────
  if (uploadFlow === "analyzing") return renderAnalyzing();
  if (uploadFlow === "results")   return renderResults();
  if (uploadFlow === "review")    return renderReview();
  if (uploadFlow === "done")      return renderDone();

  return (
    <div className="flex h-full overflow-hidden relative" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
      {/* ── Upload modal ── */}
      {uploadFlow === "modal" && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setUploadFlow(null)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <div className="text-lg font-bold text-foreground">회의록 업로드</div>
                  <div className="text-xs text-muted-foreground mt-0.5">회의 파일을 업로드하면 AI가 자동으로 분석하고 업무를 생성합니다.</div>
                </div>
                <button onClick={() => setUploadFlow(null)} className="p-1.5 hover:bg-muted rounded-lg transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Step 0: type selection */}
                {modalStep === 0 && (
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-3">업로드 유형 선택</div>
                    <div className="grid grid-cols-3 gap-3">
                      {UPLOAD_TYPES.map(t => {
                        const Icon = t.icon; const sel = uploadType === t.id;
                        return (
                          <button key={t.id} onClick={() => {
                            const nextType = t.id as UploadType;
                            setUploadType(nextType);
                            setSelectedFile(null);
                            setUploadFileName("");
                            setUploadFileSize("");
                            setAnalysisError(null);
                          }}
                            className={`flex flex-col items-center gap-2.5 p-5 rounded-xl border-2 transition-all hover:shadow-sm ${sel ? "shadow-sm" : "border-border hover:border-slate-300"}`}
                            style={sel ? { borderColor:t.color, background:t.bg } : {}}>
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background:sel ? t.bg : "#F4F6FA" }}>
                              <Icon className="w-6 h-6" style={{ color:t.color }} />
                            </div>
                            <div className="text-center">
                              <div className="text-sm font-bold text-foreground">{t.label}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{t.desc}</div>
                            </div>
                            {sel && <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background:t.color }}><Check className="w-3 h-3 text-white" /></div>}
                          </button>
                        );
                      })}
                    </div>
                    {uploadType && (
                      <div className="mt-3 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        {UPLOAD_TYPES.find(t => t.id === uploadType)?.note}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 1: form + file upload */}
                {modalStep === 1 && uploadType && (() => {
                  const utype = UPLOAD_TYPES.find(t => t.id === uploadType)!;
                  const Icon = utype.icon;
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:utype.bg }}><Icon className="w-4 h-4" style={{ color:utype.color }} /></div>
                        <span className="text-sm font-bold text-foreground">{utype.label}</span>
                      </div>

                      {/* File drop zone */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={utype.accept}
                        className="hidden"
                        onChange={e => handleFileSelect(e.target.files?.[0])}
                      />
                      <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer"
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                        onDragEnter={e => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFileSelect(e.dataTransfer.files?.[0]);
                        }}
                        onClick={() => fileInputRef.current?.click()}>
                        {uploadFileName ? (
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background:utype.bg }}><Icon className="w-6 h-6" style={{ color:utype.color }} /></div>
                            <div className="text-sm font-semibold text-foreground">{uploadFileName}</div>
                            <div className="text-[10px] text-muted-foreground">{uploadFileSize || "파일 선택됨"}</div>
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">업로드 완료</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <Upload className="w-8 h-8 text-muted-foreground" />
                            <div className="text-sm font-medium text-foreground">파일을 드래그하거나 클릭하여 업로드</div>
                            <div className="text-xs text-muted-foreground">{utype.accept.toUpperCase().replace(/\./g,'').replace(/,/g,', ')} 지원</div>
                          </div>
                        )}
                      </div>

                      {/* Metadata form */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-foreground block mb-1.5">회의 제목 <span className="text-red-500">*</span></label>
                          <input value={meetTitle} onChange={e => setMeetTitle(e.target.value)} placeholder="예: 7차 정기 회의 — 결제 연동 점검"
                            className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">회의 날짜</label>
                          <input type="date" value={meetDate} onChange={e => setMeetDate(e.target.value)} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">회의 유형</label>
                          <select value={meetKind} onChange={e => setMeetKind(e.target.value)} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400">
                            {MEET_KINDS.map(k => <option key={k}>{k}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Participants */}
                      <div>
                        <label className="text-xs font-semibold text-foreground block mb-2">참석자</label>
                        <div className="flex flex-wrap gap-2">
                          {MEMBERS.map(m => {
                            const sel = partIds.includes(m.id);
                            return (
                              <button key={m.id} onClick={() => setPartIds(p => sel ? p.filter(x=>x!==m.id) : [...p,m.id])}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${sel ? "border-blue-400 bg-blue-50 text-blue-700" : "border-border bg-card text-muted-foreground hover:border-slate-300"}`}>
                                <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ background:m.color }}>{m.initials}</div>
                                {m.name}
                                {sel && <Check className="w-3 h-3" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Auto analyze toggle */}
                      <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/50 border border-border">
                        <div>
                          <div className="text-xs font-semibold text-foreground">자동 분석 시작</div>
                          <div className="text-[10px] text-muted-foreground">업로드 후 즉시 AI 분석을 시작합니다.</div>
                        </div>
                        <div className="w-10 h-6 rounded-full flex items-center px-0.5 cursor-pointer" style={{ background:"var(--primary)" }}>
                          <div className="w-5 h-5 rounded-full bg-white shadow-sm ml-auto" />
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <button onClick={() => modalStep===0 ? setUploadFlow(null) : setModalStep(0)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors">
                  <ArrowLeft className="w-4 h-4" />{modalStep===0?"취소":"이전"}
                </button>
                {modalStep === 0 ? (
                  <button onClick={() => setModalStep(1)} disabled={!uploadType}
                    className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 hover:opacity-90 transition-opacity"
                    style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                    다음<ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={startAnalysis}
                    disabled={!selectedFile}
                    className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 hover:opacity-90 transition-opacity"
                    style={{ background:"linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
                    <Sparkles className="w-4 h-4" />AI 분석 시작
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Meeting list ── */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <button onClick={() => { setUploadFlow("modal"); setModalStep(0); setUploadType(null); setUploadFileName(""); setUploadFileSize(""); setSelectedFile(null); setAnalysisSource(null); setAnalysisError(null); }}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background:"linear-gradient(135deg,#7048E8 0%,#4F6EF7 100%)" }}>
            <Upload className="w-4 h-4" />회의록 업로드
          </button>
          <button className="p-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors">
            <Mic className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {meetings.length === 0 ? (
            <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center px-4 text-muted-foreground">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <FileAudio className="w-7 h-7 text-slate-400" />
              </div>
              <div className="text-sm font-semibold text-foreground mb-1">아직 업로드한 회의록이 없습니다</div>
              <div className="text-xs leading-relaxed mb-4">문서, 음성, 영상 파일을 업로드하면 AI 분석 결과가 이곳에 자동으로 쌓입니다.</div>
              <button onClick={() => { setUploadFlow("modal"); setModalStep(0); setUploadType(null); setUploadFileName(""); setUploadFileSize(""); setSelectedFile(null); setAnalysisError(null); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ background:"linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
                회의록 업로드
              </button>
            </div>
          ) : meetings.map(m => (
            <button key={m.id} onClick={() => setSelected(m.id)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${selected === m.id ? "border-blue-300 bg-blue-50" : "border-border bg-card hover:bg-muted"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-muted-foreground">{m.date}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${m.status === "processed" ? "bg-emerald-100 text-emerald-600" : m.status === "processing" ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
                  {m.status === "processed" ? "AI 분석 완료" : m.status === "processing" ? "분석 중" : "예정"}
                </span>
              </div>
              <div className="text-sm font-medium text-foreground leading-snug">{m.title}</div>
              {m.duration !== "—" && <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{m.duration}</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {meeting && meeting.summary ? (
          <div className="max-w-2xl space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" style={{ color: "var(--accent)" }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>AI 회의록 분석</span>
              </div>
              <h2 className="text-lg font-bold text-foreground">{meeting.title}</h2>
              <div className="text-xs text-muted-foreground mt-0.5">{meeting.date} · {meeting.duration}</div>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">회의 요약</div>
              <p className="text-sm text-foreground leading-relaxed">{meeting.summary}</p>
            </div>

            {meeting.decisions && (
              <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCheck className="w-4 h-4 text-emerald-500" />
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">핵심 결정사항</div>
                </div>
                <ul className="space-y-2">
                  {meeting.decisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {meeting.todos && (
              <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4" style={{ color: "var(--primary)" }} />
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">생성된 To-Do</div>
                  </div>
                  <button
                    onClick={() => analysisResult && setUploadFlow("review")}
                    disabled={!analysisResult}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed">
                    업무로 등록
                  </button>
                </div>
                <ul className="space-y-2">
                  {meeting.todos.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <Circle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {meeting.risks && (
              <div className="rounded-xl p-5 border border-amber-200 bg-amber-50">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider">위험 요소</div>
                </div>
                <ul className="space-y-2">
                  {meeting.risks.map((r, i) => (
                    <li key={i} className="text-sm text-amber-800">{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : meeting ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
            <Clock className="w-12 h-12 text-muted" />
            <div className="text-sm font-medium">
              {meeting.status === "pending" ? "예정된 회의입니다" : "AI 분석이 준비되지 않았습니다"}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <FileAudio className="w-8 h-8 text-slate-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground mb-1">
                {meetings.length === 0 ? "분석할 회의록을 업로드해주세요" : "회의록을 선택하세요"}
              </div>
              <div className="text-xs leading-relaxed max-w-sm">
                {meetings.length === 0
                  ? "업로드 후 분석이 완료되면 회의 요약, 핵심 결정사항, 생성된 To-Do, 위험 요소가 이 화면에 표시됩니다."
                  : "왼쪽 목록에서 분석된 회의록을 선택하면 상세 결과를 확인할 수 있습니다."}
              </div>
            </div>
            {meetings.length === 0 && (
              <button onClick={() => { setUploadFlow("modal"); setModalStep(0); setUploadType(null); setUploadFileName(""); setUploadFileSize(""); setSelectedFile(null); setAnalysisError(null); }}
                className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ background:"linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
                회의록 업로드
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── deliverables (redesigned) ────────────────────────────────────────────────
type DelivStatus = "pending" | "draft" | "editing" | "done";

interface DelivCard {
  id: string; type: string; title: string; status: DelivStatus;
  updatedAt: string; author: string; linkedTasks: number; fileType?: string; version?: string;
}

const DELIV_CATS = [
  "발표자료","보고서","README","제안서","실험 보고서","회고",
  "시연 자료","포스터/요약","API 문서","제출 패키지","기타",
];

const DELIV_CAT_ICONS: Record<string, any> = {
  "발표자료": Layers, "보고서": FileText, "README": Code2, "제안서": Star,
  "실험 보고서": FlaskConical, "회고": RefreshCw, "시연 자료": Film,
  "포스터/요약": ClipboardList, "API 문서": Globe, "제출 패키지": Package, "기타": MoreHorizontal,
};

const DELIV_CAT_COLORS: Record<string, string> = {
  "발표자료":"#D946EF","보고서":"#3B5BDB","README":"#374151","제안서":"#F59E0B",
  "실험 보고서":"#10B981","회고":"#7048E8","시연 자료":"#0EA5E9","포스터/요약":"#F43F5E",
  "API 문서":"#6366F1","제출 패키지":"#059669","기타":"#8892A4",
};

const DELIV_CARDS: DelivCard[] = [
  { id:"D1", type:"발표자료",   title:"최종 발표 PPT 초안",         status:"draft",   updatedAt:"12.10", author:"김민준", linkedTasks:3, fileType:"PPTX", version:"v0.1" },
  { id:"D2", type:"보고서",     title:"중간 진행 보고서",            status:"done",    updatedAt:"12.05", author:"이서연", linkedTasks:5, fileType:"PDF",  version:"v1.0" },
  { id:"D3", type:"README",     title:"GitHub README 초안",          status:"draft",   updatedAt:"12.08", author:"박지수", linkedTasks:2, fileType:"MD",   version:"v0.2" },
  { id:"D4", type:"제안서",     title:"공모전 제안서",               status:"done",    updatedAt:"11.28", author:"김민준", linkedTasks:4, fileType:"PDF",  version:"v1.0" },
  { id:"D5", type:"회고",       title:"6주차 스프린트 회고",         status:"pending", updatedAt:"—",     author:"—",     linkedTasks:0 },
  { id:"D6", type:"실험 보고서",title:"AI 예측 모델 실험 보고서",    status:"draft",   updatedAt:"12.09", author:"김민준", linkedTasks:2, fileType:"PDF",  version:"v0.1" },
];

const STATUS_META: Record<DelivStatus, { label: string; cls: string }> = {
  pending: { label:"생성 전", cls:"bg-slate-100 text-slate-500" },
  draft:   { label:"초안",   cls:"bg-blue-100 text-blue-600" },
  editing: { label:"수정 중",cls:"bg-amber-100 text-amber-600" },
  done:    { label:"완료",   cls:"bg-emerald-100 text-emerald-600" },
};

const DATA_SOURCES = ["회의록","To-Do","업무 보드","GitHub 기록","대시보드 진행률","업로드 파일"];
const FILE_FORMATS = ["PDF","DOCX","PPTX","Markdown"];
const TONE_OPTIONS = ["공식적","간결","자세히","발표용"];

function DeliverablesView() {
  const [activeCat, setActiveCat] = useState(getDesignParam("delivCat") ?? "발표자료");
  const [selCard, setSelCard] = useState<string|null>(getDesignParam("delivCard"));
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState(getDesignParam("delivGenerating") === "1");
  const [selSources, setSelSources] = useState<string[]>(["회의록","To-Do","업무 보드"]);
  const [selTone, setSelTone] = useState("공식적");
  const [selFormat, setSelFormat] = useState("PDF");
  const [delivTitle, setDelivTitle] = useState("");
  const [panelTab, setPanelTab] = useState<"info"|"preview"|"versions">((getDesignParam("delivPanel") as "info"|"preview"|"versions") ?? "info");
  const [aiComment, setAiComment] = useState("");

  // Category-specific form state
  const [presType, setPresType] = useState("최종발표");
  const [presTime, setPresTime] = useState("15분");
  const [presSlides, setPresSlides] = useState("20");
  const [reportType, setReportType] = useState("최종보고");
  const [reportSections, setReportSections] = useState<string[]>(["개요","개발과정","주요기능","진행률","팀원역할"]);
  const [readmeSections, setReadmeSections] = useState<string[]>(["프로젝트 소개","핵심 기능","기술 스택","실행 방법","팀원 소개"]);
  const [proposalType, setProposalType] = useState("공모전");
  const [kptKeep, setKptKeep] = useState("");
  const [kptProb, setKptProb] = useState("");
  const [kptTry, setKptTry] = useState("");

  const selCardData = selCard ? DELIV_CARDS.find(d => d.id === selCard) : null;
  const filteredCards = DELIV_CARDS.filter(d => {
    const matchCat = d.type === activeCat || DELIV_CARDS.filter(x => x.type === activeCat).length === 0;
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const toggleSource = (s: string) => setSelSources(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => setGenerating(false), 1800);
  };

  // ── Category-specific form content ─────────────────────────────────────────
  const renderCatForm = () => {
    switch (activeCat) {
      case "발표자료": return (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">발표 유형</div>
            <div className="flex gap-1.5 flex-wrap">
              {["중간발표","최종발표","데모"].map(t => (
                <button key={t} onClick={() => setPresType(t)} className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${presType===t?"border-blue-500 bg-blue-50 text-blue-700":"border-border text-muted-foreground hover:border-slate-300"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">발표 시간</div>
            <select value={presTime} onChange={e => setPresTime(e.target.value)} className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400">
              {["5분","10분","15분","20분","30분"].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">슬라이드 수</div>
            <input type="number" value={presSlides} onChange={e => setPresSlides(e.target.value)} min="5" max="50"
              className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">발표 대상</div>
            <input placeholder="예: 교수님, 심사위원, 기업 멘토" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">시연 여부</div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer" style={{ background:"var(--primary)" }}><div className="w-4 h-4 rounded-full bg-white shadow-sm ml-auto" /></div>
              <span className="text-xs text-foreground">시연 포함</span>
            </div>
          </div>
        </div>
      );

      case "보고서": return (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">보고서 유형</div>
            <div className="flex gap-1.5 flex-wrap">
              {["중간보고","최종보고","진행보고"].map(t => (
                <button key={t} onClick={() => setReportType(t)} className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${reportType===t?"border-blue-500 bg-blue-50 text-blue-700":"border-border text-muted-foreground hover:border-slate-300"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">제출 대상</div>
            <input placeholder="예: 담당 교수님, 지도교사" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">포함 섹션</div>
            {["개요","개발과정","주요기능","진행률","팀원역할","향후계획","문제해결"].map(s => (
              <label key={s} className="flex items-center gap-2 py-0.5 cursor-pointer">
                <div onClick={() => setReportSections(p => p.includes(s) ? p.filter(x=>x!==s) : [...p,s])}
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${reportSections.includes(s)?"border-blue-500 bg-blue-500":"border-border"}`}>
                  {reportSections.includes(s) && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="text-xs text-foreground">{s}</span>
              </label>
            ))}
          </div>
        </div>
      );

      case "README": return (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">GitHub 저장소</div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-foreground flex-1 truncate">team-smartparking/smart-parking</span>
              <span className="text-[10px] text-emerald-600 font-medium">연결됨</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">포함할 섹션</div>
            {["프로젝트 소개","핵심 기능","기술 스택","실행 방법","폴더 구조","API 정보","팀원 소개","배포 링크"].map(s => (
              <label key={s} className="flex items-center gap-2 py-0.5 cursor-pointer">
                <div onClick={() => setReadmeSections(p => p.includes(s) ? p.filter(x=>x!==s) : [...p,s])}
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${readmeSections.includes(s)?"border-blue-500 bg-blue-500":"border-border"}`}>
                  {readmeSections.includes(s) && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="text-xs text-foreground">{s}</span>
              </label>
            ))}
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">배지 추가</div>
            <div className="flex flex-wrap gap-1.5">
              {["License","Stars","Contributors","Build"].map(b => (
                <span key={b} className="text-[10px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border cursor-pointer hover:border-blue-400 transition-colors">{b}</span>
              ))}
            </div>
          </div>
        </div>
      );

      case "제안서": return (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">제안서 유형</div>
            <div className="flex gap-1.5 flex-wrap">
              {["공모전","해커톤","캡스톤","기타"].map(t => (
                <button key={t} onClick={() => setProposalType(t)} className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${proposalType===t?"border-amber-500 bg-amber-50 text-amber-700":"border-border text-muted-foreground hover:border-slate-300"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">문제 정의</div>
            <textarea rows={2} placeholder="해결하려는 문제를 간략히 설명하세요" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">해결 방안</div>
            <textarea rows={2} placeholder="우리 서비스가 어떻게 문제를 해결하는지" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">차별성</div>
            <textarea rows={2} placeholder="경쟁 서비스 대비 차별화 포인트" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
          </div>
        </div>
      );

      case "실험 보고서": return (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">실험 목적</div>
            <input placeholder="예: 주차 빈자리 예측 정확도 향상" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">모델 종류</div>
            <input placeholder="예: Random Forest, LSTM, XGBoost" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">데이터셋</div>
            <input placeholder="예: CCTV 센서 90일 데이터, 10만 건" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">평가 지표</div>
            {["Accuracy","F1-Score","RMSE","MAE","AUC"].map(m => (
              <label key={m} className="flex items-center gap-2 py-0.5 cursor-pointer">
                <div className="w-3.5 h-3.5 rounded border border-blue-500 bg-blue-500 flex items-center justify-center"><Check className="w-2.5 h-2.5 text-white" /></div>
                <span className="text-xs text-foreground">{m}</span>
              </label>
            ))}
          </div>
        </div>
      );

      case "회고": return (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">회고 유형</div>
            <div className="flex gap-1.5 flex-wrap">
              {["팀 회고","개인 회고","스프린트 회고"].map(t => (
                <button key={t} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-blue-500 bg-blue-50 text-blue-700 first:block hidden first:inline-block">{t}</button>
              ))}
              <button className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-blue-500 bg-blue-50 text-blue-700">팀 회고</button>
              <button className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-slate-300">개인 회고</button>
              <button className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-slate-300">스프린트</button>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Keep — 잘한 점</span>
            </div>
            <textarea rows={2} value={kptKeep} onChange={e => setKptKeep(e.target.value)} placeholder="이번 주 잘한 것, 계속하면 좋을 것" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-emerald-400 resize-none" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-[10px] font-semibold text-red-700 uppercase tracking-wider">Problem — 아쉬운 점</span>
            </div>
            <textarea rows={2} value={kptProb} onChange={e => setKptProb(e.target.value)} placeholder="이번 주 문제가 된 것, 개선이 필요한 것" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-red-400 resize-none" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">Try — 개선할 점</span>
            </div>
            <textarea rows={2} value={kptTry} onChange={e => setKptTry(e.target.value)} placeholder="다음 주에 시도해볼 것" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
          </div>
        </div>
      );

      default: return (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">산출물명</div>
            <input placeholder="산출물 이름을 직접 입력하세요" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">산출물 설명</div>
            <textarea rows={2} placeholder="이 산출물의 목적을 설명하세요" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">필요한 구성 항목</div>
            <textarea rows={2} placeholder="포함되어야 할 내용을 입력하세요" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">완료 기준</div>
            <input placeholder="이 산출물의 완료 조건" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
          </div>
          <button className="w-full text-xs font-medium py-2 rounded-lg border border-dashed border-purple-300 text-purple-600 hover:bg-purple-50 transition-colors flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />AI가 구조 추천
          </button>
        </div>
      );
    }
  };

  // ── AI Preview content per category ──────────────────────────────────────────
  const AI_PREVIEWS: Record<string, string> = {
    "발표자료": "**[슬라이드 목차 초안]**\n\n1. 표지 — 스마트 주차 관리 시스템\n2. 문제 정의 — 도심 주차 문제\n3. 솔루션 소개 — AI 기반 빈자리 예측\n4. 핵심 기능 4가지\n5. 기술 스택 & 아키텍처\n6. AI 모델 성능 (87% → 90%)\n7. 시연 시나리오\n8. 기대 효과 & 확장성\n9. Q&A",
    "보고서": "**1. 프로젝트 개요**\n스마트 주차 관리 시스템은 AI 기반 빈자리 예측과 실시간 모니터링을 통해...\n\n**2. 개발 진행 현황**\n- 완료: 요구사항 분석, 시스템 설계, 핵심 기능 개발 (65%)\n- 진행 중: 결제 연동, AI 모델 고도화\n- 예정: 통합 테스트, 발표 준비",
    "README": "# 🚗 스마트 주차 관리 시스템\n\n> AI 기반 실시간 주차 빈자리 예측 및 예약 서비스\n\n## 핵심 기능\n- 실시간 주차 현황 모니터링\n- AI 빈자리 예측 (정확도 87%)\n- 모바일 사전 예약\n- 카카오페이 결제 연동\n\n## 기술 스택\n`React` `Spring Boot` `Python` `MySQL` `AWS`",
    "제안서": "**문제 정의**\n도심 내 불필요한 주차 탐색으로 인한 교통 혼잡과 탄소 배출이 심각합니다.\n\n**해결 방안**\nAI가 실시간으로 빈자리를 예측하고, 사전 예약 시스템을 통해 불필요한 이동을 최소화합니다.\n\n**차별성**\n기존 서비스와 달리 딥러닝 기반 예측 모델로 90% 이상의 정확도를 목표로 합니다.",
    "실험 보고서": "**실험 설계**\n- 모델: Random Forest + LSTM 앙상블\n- 데이터: CCTV 센서 90일치 (시간대별 120만 건)\n\n**평가 결과**\n| 모델 | Accuracy | MAE |\n|------|----------|-----|\n| RF   | 83%      | 2.1 |\n| LSTM | 87%      | 1.8 |\n| 앙상블| 89%     | 1.5 |",
    "회고": "**✅ Keep**\n- 회의록 AI 도입으로 업무 자동화 효율 향상\n- GitHub 코드리뷰 문화 정착\n\n**❌ Problem**\n- 결제 SDK 충돌로 일정 지연\n- QA 시간 부족\n\n**🔄 Try**\n- 블로커 발생 시 팀장에게 즉시 보고 원칙 강화\n- 다음 스프린트 QA 시간 2일 이상 확보",
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>

      {/* ── Top header ── */}
      <div className="shrink-0 px-5 pt-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-foreground">산출물 생성</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="산출물 검색..."
                className="pl-9 pr-4 py-1.5 text-xs rounded-lg border border-border bg-card outline-none focus:border-blue-400 w-44" />
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg" style={{ background:"linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
              <Plus className="w-3.5 h-3.5" />새 산출물
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-3">
          {DELIV_CATS.map(cat => {
            const Icon = DELIV_CAT_ICONS[cat] ?? FileText;
            const color = DELIV_CAT_COLORS[cat] ?? "#3B5BDB";
            const active = activeCat === cat;
            return (
              <button key={cat} onClick={() => setActiveCat(cat)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all ${active ? "text-white shadow-sm" : "bg-card border border-border text-muted-foreground hover:border-slate-300"}`}
                style={active ? { background: color } : {}}>
                <Icon className="w-3 h-3" />{cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* Left: creation form */}
        <div className="w-72 shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Common: title */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                {(() => { const Icon = DELIV_CAT_ICONS[activeCat] ?? FileText; const color = DELIV_CAT_COLORS[activeCat] ?? "#3B5BDB"; return <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background:`${color}20` }}><Icon className="w-3.5 h-3.5" style={{ color }} /></div>; })()}
                <span className="text-sm font-bold text-foreground">{activeCat}</span>
              </div>
              <input value={delivTitle} onChange={e => setDelivTitle(e.target.value)} placeholder={`${activeCat} 제목 입력`}
                className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 mb-2" />
            </div>

            {/* Common: AI sources */}
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">AI 참고 자료</div>
              <div className="flex flex-wrap gap-1.5">
                {DATA_SOURCES.map(s => (
                  <button key={s} onClick={() => toggleSource(s)}
                    className={`text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all ${selSources.includes(s) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border bg-card text-muted-foreground hover:border-slate-300"}`}>
                    {selSources.includes(s) && "✓ "}{s}
                  </button>
                ))}
              </div>
            </div>

            {/* Category-specific form */}
            <div className="pt-3 border-t border-border">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">카테고리 설정</div>
              {renderCatForm()}
            </div>

            {/* Common: tone + format */}
            <div className="pt-3 border-t border-border space-y-3">
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">생성 톤</div>
                <div className="grid grid-cols-2 gap-1">
                  {TONE_OPTIONS.map(t => (
                    <button key={t} onClick={() => setSelTone(t)}
                      className={`text-[10px] font-semibold py-1.5 rounded-lg border transition-all ${selTone===t ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:border-slate-300"}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">파일 형식</div>
                <div className="grid grid-cols-4 gap-1">
                  {FILE_FORMATS.map(f => (
                    <button key={f} onClick={() => setSelFormat(f)}
                      className={`text-[10px] font-semibold py-1.5 rounded-lg border transition-all ${selFormat===f ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:border-slate-300"}`}>{f}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Deadline */}
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">제출 마감일</div>
              <input type="date" className="w-full text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400" />
            </div>
          </div>

          {/* Generate button */}
          <div className="shrink-0 p-4 border-t border-border">
            <button onClick={handleGenerate} disabled={generating}
              className="w-full py-2.5 text-sm font-bold text-white rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-70"
              style={{ background:"linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
              {generating ? (
                <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />초안 생성 중...</>
              ) : (
                <><Sparkles className="w-4 h-4" />AI 초안 생성</>
              )}
            </button>
            <p className="text-[10px] text-muted-foreground text-center mt-2">{selSources.length}개 데이터 소스 참고 · {selFormat} 형식</p>
          </div>
        </div>

        {/* Center: card grid */}
        <div className={`flex-1 overflow-y-auto p-5 ${selCard ? "min-w-0" : ""}`}>
          {/* AI recommendation box */}
          <div className="mb-4 px-4 py-3 rounded-xl border border-purple-200 flex items-start gap-3" style={{ background:"rgba(112,72,232,0.05)" }}>
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color:"#7048E8" }} />
            <div className="text-xs text-muted-foreground leading-relaxed flex-1">
              <strong className="text-foreground">AI 추천:</strong> 6차 회의록과 업무 보드 데이터를 기반으로 <strong className="text-foreground">{activeCat}</strong> 초안을 바로 생성할 수 있습니다. 회의에서 결정된 내용과 현재 진행률이 자동 반영됩니다.
            </div>
            <button onClick={handleGenerate} className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg transition-opacity hover:opacity-80" style={{ background:"rgba(112,72,232,0.15)", color:"#7048E8" }}>
              바로 생성
            </button>
          </div>

          {/* Section title */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-foreground">산출물 목록 <span className="text-muted-foreground font-normal">({DELIV_CARDS.length}개)</span></div>
            <select className="text-xs border border-border rounded-lg px-2 py-1 bg-card outline-none text-muted-foreground">
              <option>최신순</option><option>유형별</option><option>상태별</option>
            </select>
          </div>

          {/* Card grid */}
          <div className="grid grid-cols-2 gap-3">
            {DELIV_CARDS.filter(d => !search || d.title.toLowerCase().includes(search.toLowerCase())).map(d => {
              const Icon = DELIV_CAT_ICONS[d.type] ?? FileText;
              const color = DELIV_CAT_COLORS[d.type] ?? "#3B5BDB";
              const sm = STATUS_META[d.status];
              const isSelected = selCard === d.id;
              return (
                <div key={d.id} onClick={() => { setSelCard(d.id === selCard ? null : d.id); setPanelTab("info"); }}
                  className={`bg-card rounded-xl p-4 border-2 cursor-pointer transition-all hover:shadow-md group ${isSelected ? "border-blue-400 shadow-md" : "border-border shadow-sm hover:border-slate-300"}`}>
                  <div className="flex items-start justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:`${color}18` }}>
                        <Icon className="w-4 h-4" style={{ color }} />
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">{d.type}</div>
                        <div className="text-xs font-bold text-foreground leading-snug">{d.title}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${sm.cls}`}>{sm.label}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      {d.author !== "—" && (
                        <div className="flex items-center gap-1">
                          {(() => { const m = MEMBERS.find(me => me.name === d.author); return m ? <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ background:m.color }}>{m.initials}</div> : null; })()}
                          <span>{d.author}</span>
                        </div>
                      )}
                      {d.linkedTasks > 0 && <span className="px-1.5 py-0.5 rounded bg-muted font-medium">업무 {d.linkedTasks}개</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>{d.updatedAt}</span>
                      {d.fileType && <span className="font-semibold text-blue-600">{d.fileType}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-700"><Eye className="w-3 h-3" />미리보기</button>
                    <button className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground ml-auto"><Download className="w-3 h-3" />다운로드</button>
                    <button className="p-0.5 rounded hover:bg-muted transition-colors"><MoreHorizontal className="w-3 h-3 text-muted-foreground" /></button>
                  </div>
                </div>
              );
            })}

            {/* Placeholder card for generating */}
            {generating && (
              <div className="bg-card rounded-xl p-4 border-2 border-dashed border-blue-300 animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:"rgba(112,72,232,0.15)" }}>
                    <Sparkles className="w-4 h-4" style={{ color:"#7048E8" }} />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{activeCat}</div>
                    <div className="text-xs font-semibold text-blue-600">AI 초안 생성 중...</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                    <div className="h-1.5 bg-blue-500 rounded-full animate-pulse" style={{ width:"60%" }} />
                  </div>
                  <span className="text-[10px] text-blue-600 font-medium">60%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: detail panel */}
        {selCardData && (
          <div className="w-80 shrink-0 border-l border-border flex flex-col h-full overflow-hidden bg-card">
            {/* Panel header */}
            <div className="flex items-start gap-2 p-4 border-b border-border">
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-1.5 mb-1.5">
                  {(() => { const Icon = DELIV_CAT_ICONS[selCardData.type] ?? FileText; const color = DELIV_CAT_COLORS[selCardData.type] ?? "#3B5BDB"; return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background:`${color}18`, color }}><Icon className="w-2.5 h-2.5" />{selCardData.type}</span>; })()}
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_META[selCardData.status].cls}`}>{STATUS_META[selCardData.status].label}</span>
                </div>
                <div className="text-sm font-bold text-foreground leading-snug">{selCardData.title}</div>
              </div>
              <button onClick={() => setSelCard(null)} className="p-1.5 hover:bg-muted rounded-lg shrink-0"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>

            {/* Panel tabs */}
            <div className="flex border-b border-border shrink-0">
              {(["info","preview","versions"] as const).map(tab => {
                const l = { info:"정보", preview:"AI 미리보기", versions:"버전" };
                return <button key={tab} onClick={() => setPanelTab(tab)} className={`flex-1 text-[11px] font-semibold py-2.5 border-b-2 transition-colors ${panelTab===tab?"border-blue-500 text-blue-600":"border-transparent text-muted-foreground hover:text-foreground"}`}>{l[tab]}</button>;
              })}
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {panelTab === "info" && (
                <>
                  <div className="space-y-2 text-xs">
                    {[
                      ["작성자", selCardData.author],
                      ["최근 업데이트", selCardData.updatedAt],
                      ["파일 형식", selCardData.fileType ?? "—"],
                      ["버전", selCardData.version ?? "—"],
                      ["연결된 업무", `${selCardData.linkedTasks}개`],
                    ].map(([l, v]) => (
                      <div key={l as string} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-20 shrink-0">{l}</span>
                        <span className="font-medium text-foreground">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-3 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">참고한 데이터 출처</div>
                    <div className="flex flex-wrap gap-1.5">
                      {["6차 회의록","업무 보드","GitHub 기록","대시보드"].map(s => (
                        <span key={s} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div className="pt-3 border-t border-border space-y-2">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">액션</div>
                    <button className="w-full flex items-center gap-2 py-2 px-3 text-xs font-semibold text-white rounded-xl hover:opacity-90 transition-opacity" style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                      <Download className="w-3.5 h-3.5" />다운로드 ({selCardData.fileType ?? "PDF"})
                    </button>
                    <button className="w-full flex items-center gap-2 py-2 px-3 text-xs font-medium border border-border bg-card text-foreground rounded-xl hover:bg-muted transition-colors">
                      <Pencil className="w-3.5 h-3.5" />직접 편집하기
                    </button>
                    <button className="w-full flex items-center gap-2 py-2 px-3 text-xs font-medium border border-border bg-card text-foreground rounded-xl hover:bg-muted transition-colors">
                      <Link2 className="w-3.5 h-3.5" />업무 보드에 연결
                    </button>
                    <button className="w-full flex items-center gap-2 py-2 px-3 text-xs font-medium rounded-xl transition-opacity hover:opacity-80" style={{ background:"rgba(112,72,232,0.1)", color:"#7048E8" }}>
                      <Sparkles className="w-3.5 h-3.5" />AI 재생성 요청
                    </button>
                  </div>
                  {/* AI feedback input */}
                  <div className="pt-3 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">AI 수정 요청</div>
                    <div className="flex gap-2">
                      <textarea value={aiComment} onChange={e => setAiComment(e.target.value)} rows={2}
                        placeholder="예: 결론 부분을 더 간결하게 해줘, 3페이지를 발표용으로 바꿔줘"
                        className="flex-1 text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none" />
                      <button onClick={() => setAiComment("")} className="self-end p-2 rounded-lg text-white shrink-0" style={{ background:"var(--primary)" }}>
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {panelTab === "preview" && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4" style={{ color:"#7048E8" }} />
                    <span className="text-xs font-semibold text-foreground">AI 생성 내용 미리보기</span>
                  </div>
                  {selCardData.status === "pending" ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background:"rgba(112,72,232,0.1)" }}>
                        <Sparkles className="w-6 h-6" style={{ color:"#7048E8" }} />
                      </div>
                      <div className="text-sm font-semibold text-foreground">아직 생성되지 않았습니다</div>
                      <p className="text-xs text-muted-foreground">왼쪽 패널에서 설정 후 AI 초안 생성을 클릭하세요.</p>
                      <button onClick={handleGenerate} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-xl hover:opacity-90" style={{ background:"linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
                        <Sparkles className="w-4 h-4" />지금 생성하기
                      </button>
                    </div>
                  ) : (
                    <div className="bg-muted/50 rounded-xl p-4 text-xs text-foreground leading-relaxed whitespace-pre-wrap font-mono border border-border">
                      {AI_PREVIEWS[selCardData.type] ?? "AI가 생성한 내용이 여기에 표시됩니다."}
                    </div>
                  )}
                </div>
              )}

              {panelTab === "versions" && (
                <div className="space-y-3">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">버전 기록</div>
                  {[
                    { ver:"v0.1", date:"12.10 14:32", note:"AI 초안 생성 (6차 회의록 기반)", author:"AI" },
                    { ver:"v0.2", date:"12.10 16:14", note:"발표 유형을 최종발표로 변경", author:"김민준" },
                    { ver:"v0.3", date:"12.11 09:30", note:"슬라이드 3~5장 내용 보강", author:"이서연" },
                  ].map(v => {
                    const isAI = v.author === "AI";
                    return (
                      <div key={v.ver} className="flex items-start gap-2.5">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 mt-0.5 ${isAI ? "" : ""}`}
                          style={{ background: isAI ? "#7048E8" : (MEMBERS.find(m => m.name === v.author)?.color ?? "#8892A4") }}>
                          {isAI ? "AI" : v.author[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-foreground">{v.ver}</span>
                            <span className="text-[10px] text-muted-foreground">{v.date}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">{v.note}</div>
                          <button className="text-[10px] text-blue-600 hover:text-blue-700 mt-0.5">이 버전으로 복원</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── github view ──────────────────────────────────────────────────────────────
function GithubView() {
  return (
    <div className="p-6 space-y-4 overflow-y-auto h-full" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 px-4 py-2.5 bg-card rounded-xl border border-border shadow-sm">
          <Github className="w-4 h-4 text-foreground" />
          <span className="text-sm font-medium text-foreground">team-smartparking / smart-parking-system</span>
          <span className="text-[10px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-medium">연결됨</span>
        </div>
        <button className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors">
          <Zap className="w-3.5 h-3.5" /> 동기화
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[{ label: "커밋", value: 87, icon: GitCommit, color: "#3B5BDB" }, { label: "PR", value: 19, icon: GitPullRequest, color: "#7048E8" }, { label: "Merged PR", value: 16, icon: GitMerge, color: "#10B981" }, { label: "이슈", value: 24, icon: Hash, color: "#F59E0B" }].map(s => (
          <div key={s.label} className="bg-card rounded-xl p-4 border border-border shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${s.color}18` }}>
              <s.icon className="w-4 h-4" style={{ color: s.color }} />
            </div>
            <div>
              <div className="text-xl font-bold text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="text-sm font-semibold text-foreground">최근 활동</div>
          <Sparkles className="w-4 h-4" style={{ color: "var(--accent)" }} />
        </div>
        <div className="divide-y divide-border">
          {GITHUB.map((g, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: g.type === "pr" ? "#EEF1FB" : g.type === "merge" ? "#ECFDF5" : "#F4F6FA" }}>
                {g.type === "pr" && <GitPullRequest className="w-3.5 h-3.5" style={{ color: "#3B5BDB" }} />}
                {g.type === "commit" && <GitCommit className="w-3.5 h-3.5 text-slate-500" />}
                {g.type === "merge" && <GitMerge className="w-3.5 h-3.5 text-emerald-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground font-medium truncate">{g.message}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{g.author} · {g.time}</div>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${g.type === "pr" ? "bg-blue-100 text-blue-600" : g.type === "merge" ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                {g.type === "pr" ? "PR" : g.type === "merge" ? "Merged" : "Commit"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── contributors view (reviewer only) ───────────────────────────────────────
function ContributorsView() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
        <Shield className="w-8 h-8 text-white" />
      </div>
      <div>
        <div className="text-base font-semibold text-foreground">심사자 전용 기능</div>
        <div className="text-sm text-muted-foreground mt-1 max-w-xs">개인별 기여도 분석 리포트는 심사자 계정으로만 접근할 수 있습니다.</div>
      </div>
      <div className="bg-card rounded-xl p-5 border border-border shadow-sm max-w-md w-full text-left">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">심사자 전용 데이터</div>
        <div className="space-y-2">
          {["개인별 To-Do 완료율 및 마감 준수율", "회의록 내 발언 및 결정 참여 이력", "GitHub 커밋/PR/리뷰 기여 기록", "문서 및 산출물 작성 기여 이력", "AI 기여도 근거 요약 (출처 포함)"].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AI assistant panel ───────────────────────────────────────────────────────
interface ChatMsg { role: "user" | "assistant"; content: string; }

const AI_RESPONSES: Record<string, string> = {
  "오늘 해야 할 일 알려줘": "오늘 기준으로 진행 중인 업무 4개를 확인했어요:\n\n1. **TF-05** 결제 시스템 연동 — 최동혁님 담당, 마감 D-4\n2. **TF-06** AI 빈자리 예측 모델 — 김민준님 담당, 마감 D-6\n3. **TF-07** 관리자 대시보드 통계 — 이서연님 담당\n4. **TF-08** 푸시 알림 서비스 — 최동혁님 담당\n\n**블로커 주의**: TF-13, TF-14가 보류 상태예요. 오늘 팀장님이 확인해보시는 걸 추천해요.",
  "마감 임박한 업무 뭐야?": "마감이 임박한 업무 top 3를 알려드릴게요:\n\n🔴 **TF-13** DB 인덱싱 최적화 — 마감 12.15 (블로커 상태)\n🟡 **TF-05** 카카오페이 → 토스페이먼츠 연동 — 마감 12.18\n🟡 **TF-07** 관리자 대시보드 통계 — 마감 12.19\n\n*출처: 업무 보드 현황 (2024.12.10 기준)*",
  "블로커 해결 방법 추천해줘": "현재 블로커 2건에 대한 AI 분석 결과예요:\n\n**TF-13** DB 인덱싱 최적화\n→ 12월 3일 회의에서 MySQL 인덱싱 전략을 논의했지만 결론이 없었어요. **EXPLAIN 분석 결과를 팀 채널에 공유**하고 팀장님의 리뷰를 받아보세요.\n\n**TF-14** 결제 오류 예외 처리\n→ 토스페이먼츠 SDK 문서에 에러 코드별 처리 가이드가 있어요. **공식 문서 참고 후 PR 드래프트**를 먼저 올려보세요.",
  "발표자료 초안 만들어줘": "스마트 주차 관리 시스템 발표자료 초안을 생성했어요:\n\n📋 **목차 (8슬라이드)**\n1. 문제 정의: 도심 주차난과 비효율\n2. 솔루션 소개: AI 기반 스마트 주차\n3. 핵심 기능 (4가지)\n4. 기술 스택 & 아키텍처\n5. AI 예측 모델 성능\n6. 데모 시나리오\n7. 기대 효과 & 확장성\n8. Q&A\n\n산출물 탭에서 전체 초안을 확인하고 편집할 수 있어요.",
};

function AIAssistant({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>(CHAT_INIT.map(m => ({ role: m.role as "assistant", content: m.content })));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setTimeout(() => {
      const response = AI_RESPONSES[text] || "프로젝트 데이터를 분석 중입니다. 회의록, To-Do, GitHub 기록을 바탕으로 답변을 생성하겠습니다.";
      setMessages(prev => [...prev, { role: "assistant", content: response }]);
      setLoading(false);
    }, 1200);
  };

  return (
    <div className="fixed right-0 top-0 h-full w-[380px] shadow-2xl flex flex-col z-50" style={{ background: "#FFFFFF", fontFamily: "'Inter', 'Noto Sans KR', sans-serif", borderLeft: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border" style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">AI 어시스턴트</div>
            <div className="text-[10px] text-purple-200">스마트 주차 관리 시스템</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Quick questions */}
      <div className="px-4 py-3 border-b border-border bg-secondary/40 flex gap-2 overflow-x-auto scrollbar-hide">
        {QUICK_QUESTIONS.map(q => (
          <button key={q} onClick={() => send(q)}
            className="shrink-0 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors text-muted-foreground whitespace-nowrap">
            {q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mr-2 mt-0.5" style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div className={`max-w-[85%] text-sm rounded-2xl px-4 py-3 whitespace-pre-wrap leading-relaxed ${m.role === "user" ? "text-white rounded-br-sm" : "text-foreground bg-secondary rounded-bl-sm"}`}
              style={m.role === "user" ? { background: "linear-gradient(135deg, #3B5BDB 0%, #4F6EF7 100%)" } : {}}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mr-2" style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-secondary rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex items-end gap-2">
          <div className="flex-1 rounded-xl border border-border bg-input-background px-3 py-2.5">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="프로젝트에 대해 무엇이든 물어보세요..."
              rows={1}
              className="w-full text-sm bg-transparent outline-none resize-none text-foreground placeholder-muted-foreground"
            />
          </div>
          <button onClick={() => send(input)} disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-opacity disabled:opacity-40 text-white"
            style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="text-[10px] text-muted-foreground text-center mt-2">회의록·To-Do·GitHub 기록 기반으로 답변합니다</div>
      </div>
    </div>
  );
}

// ─── shared detail components ─────────────────────────────────────────────────
function StatusBadge2({ status }: { status: TaskStatus }) {
  const map = {
    done:       { cls: "bg-emerald-100 text-emerald-700", label: "완료" },
    inprogress: { cls: "bg-blue-100 text-blue-700",       label: "진행 중" },
    todo:       { cls: "bg-slate-100 text-slate-600",     label: "대기" },
    blocked:    { cls: "bg-red-100 text-red-700",         label: "블로커" },
  };
  const s = map[status];
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, string> = {
    "직접 생성": "bg-slate-100 text-slate-500",
    "회의록 AI": "bg-purple-100 text-purple-600",
    "GitHub":   "bg-gray-800 text-gray-100",
  };
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${map[source] ?? "bg-slate-100 text-slate-500"}`}>{source}</span>;
}

function DetailStatCard({ label, value, sub, color, icon: Icon }: { label: string; value: string | number; sub: string; color: string; icon: any }) {
  return (
    <div className="bg-card rounded-xl p-4 flex items-center gap-3 shadow-sm border border-border">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <div className="text-xl font-bold text-foreground leading-none">{value}</div>
        <div className="text-xs font-medium text-foreground mt-0.5">{label}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
      </div>
    </div>
  );
}

function BackBtn({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack}
      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group mb-3">
      <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
      대시보드로 돌아가기
    </button>
  );
}

function AIBox({ text, onAsk }: { text: string; onAsk?: () => void }) {
  return (
    <div className="rounded-xl p-4 flex items-start gap-3 border border-purple-200" style={{ background: "rgba(112,72,232,0.05)" }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
        <Sparkles className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-foreground mb-0.5">AI 추천 액션</div>
        <div className="text-xs text-muted-foreground leading-relaxed">{text}</div>
      </div>
      {onAsk && (
        <button onClick={onAsk}
          className="text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 transition-opacity hover:opacity-80"
          style={{ background: "rgba(112,72,232,0.15)", color: "#7048E8" }}>
          AI에게 질문
        </button>
      )}
    </div>
  );
}

// ─── page 1: all tasks ────────────────────────────────────────────────────────
function AllTasksPage({ onBack }: { onBack: () => void }) {
  const tasks = useStoredTasks();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("전체");
  const [sortBy, setSortBy] = useState("마감일");
  const [selected, setSelected] = useState<string[]>([]);

  const statusMap: Record<string, TaskStatus | null> = {
    "전체": null, "대기": "todo", "진행 중": "inprogress", "완료": "done", "블로커": "blocked",
  };
  const filtered = tasks.filter(t => {
    const ms = filterStatus === "전체" || t.status === statusMap[filterStatus];
    const mq = !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.id.toLowerCase().includes(search);
    return ms && mq;
  });

  const counts = {
    total: tasks.length,
    done: tasks.filter(t => t.status === "done").length,
    inProgress: tasks.filter(t => t.status === "inprogress").length,
    blocked: tasks.filter(t => t.status === "blocked").length,
  };

  const toggleAll = () => setSelected(filtered.every(t => selected.includes(t.id)) ? [] : filtered.map(t => t.id));
  const toggle = (id: string) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">전체 업무 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">프로젝트의 모든 To-Do를 확인하고 팀원에게 배정·관리합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> 일괄 상태 변경
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ background: "var(--primary)" }}>
            <Plus className="w-3.5 h-3.5" /> 업무 추가
          </button>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="전체 업무" value={counts.total} sub="프로젝트 전체" color="#3B5BDB" icon={Layers} />
        <DetailStatCard label="완료" value={counts.done} sub={`완료율 ${counts.total ? Math.round(counts.done / counts.total * 100) : 0}%`} color="#10B981" icon={CheckCircle2} />
        <DetailStatCard label="진행 중" value={counts.inProgress} sub="활성 업무" color="#3B5BDB" icon={Clock} />
        <DetailStatCard label="블로커" value={counts.blocked} sub="즉시 해결 필요" color="#EF4444" icon={AlertTriangle} />
      </div>

      {/* AI box */}
      <AIBox
        text={counts.total
          ? `현재 ${counts.total}개 업무가 등록되어 있습니다. 회의록 AI로 생성된 업무는 담당자와 마감일 확인 후 상태를 관리하세요.`
          : "아직 등록된 업무가 없습니다. 회의록 AI에서 To-Do를 승인하면 전체 업무 목록에 표시됩니다."}
        onAsk={() => {}}
      />

      {/* filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="업무명·ID 검색..."
            className="pl-9 pr-4 py-2 text-xs rounded-lg border border-border bg-card outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all w-52" />
        </div>
        <div className="flex items-center gap-1">
          {["전체","대기","진행 중","완료","블로커"].map(f => (
            <button key={f} onClick={() => setFilterStatus(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterStatus === f ? "bg-blue-600 text-white" : "bg-card border border-border text-muted-foreground hover:border-slate-300"}`}>
              {f}
            </button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="ml-auto text-xs border border-border rounded-lg px-3 py-2 bg-card text-foreground outline-none cursor-pointer">
          <option>마감일</option><option>우선순위</option><option>상태</option><option>담당자</option>
        </select>
        {selected.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-600">
            {selected.length}개 선택 ·
            <button className="underline hover:no-underline">상태 변경</button>·
            <button className="underline hover:no-underline">담당자 변경</button>
          </div>
        )}
      </div>

      {/* pending approval banner */}
      {tasks.length === 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200">
          <FileAudio className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="text-xs text-blue-700 flex-1">회의록 AI 분석 후 역할 분배 검토에서 승인한 업무만 이 목록에 표시됩니다.</span>
        </div>
      )}

      {/* table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="pl-4 pr-2 py-3">
                <div onClick={toggleAll}
                  className={`w-4 h-4 rounded border cursor-pointer flex items-center justify-center ${filtered.every(t => selected.includes(t.id)) && filtered.length > 0 ? "border-blue-500 bg-blue-500" : "border-border hover:border-blue-400"}`}>
                  {filtered.every(t => selected.includes(t.id)) && filtered.length > 0 && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
              </th>
              {["ID","업무명","담당자","상태","우선순위","마감일","출처","액션"].map(h => (
                <th key={h} className="px-3 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(task => {
              const member = MEMBERS.find(m => m.id === task.assignee) ?? MEMBERS[0];
              const src = task.labels.includes("회의록 AI") ? "회의록 AI" : "직접 생성";
              const isSelected = selected.includes(task.id);
              const isDueSoon = task.status !== "done" && task.dueDate <= "12.18";
              return (
                <tr key={task.id} className={`hover:bg-muted/30 transition-colors ${isSelected ? "bg-blue-50/40" : ""}`}>
                  <td className="pl-4 pr-2 py-3">
                    <div onClick={() => toggle(task.id)}
                      className={`w-4 h-4 rounded border cursor-pointer flex items-center justify-center ${isSelected ? "border-blue-500 bg-blue-500" : "border-border hover:border-blue-400"}`}>
                      {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground whitespace-nowrap">{task.id}</td>
                  <td className="px-3 py-3 max-w-[200px]">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-foreground truncate">{task.title}</span>
                      {src === "회의록 AI" && <span className="text-[9px] text-purple-500">AI 생성 · 승인 대기</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: member.color }}>
                        {member.initials}
                      </div>
                      <span className="text-xs text-foreground whitespace-nowrap">{member.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><StatusBadge2 status={task.status} /></td>
                  <td className="px-3 py-3"><PriorityBadge priority={task.priority} /></td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-medium ${isDueSoon ? "text-amber-600" : "text-muted-foreground"}`}>
                      {isDueSoon && "⚠ "}{task.dueDate}
                    </span>
                  </td>
                  <td className="px-3 py-3"><SourceBadge source={src} /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <button className="text-[11px] font-medium text-blue-600 hover:text-blue-700">상세</button>
                      <span className="text-border">·</span>
                      <button className="text-[11px] font-medium text-slate-500 hover:text-foreground">상태 변경</button>
                      <button className="p-1 rounded hover:bg-muted transition-colors">
                        <MessageSquare className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{filtered.length}개 업무</span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <button className="px-2 py-1 rounded hover:bg-muted">이전</button>
            <span className="px-2 font-medium text-foreground">1 / 1</span>
            <button className="px-2 py-1 rounded hover:bg-muted">다음</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── page 2: progress analysis ────────────────────────────────────────────────
function CircleProgress({ pct, size = 160 }: { pct: number; size?: number }) {
  const r = size / 2 - 14;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEF1F8" strokeWidth="14" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`} stroke="url(#cpg)" />
      <defs>
        <linearGradient id="cpg" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3B5BDB" /><stop offset="100%" stopColor="#7048E8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ProgressPage({ onBack }: { onBack: () => void }) {
  const tasks = useStoredTasks();
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const inProgressTasks = tasks.filter(t => t.status === "inprogress").length;
  const todoTasks = tasks.filter(t => t.status === "todo").length;
  const blockedTasks = tasks.filter(t => t.status === "blocked").length;
  const progressPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const perMemberCompletion = MEMBERS.map(m => {
    const memberTasks = tasks.filter(t => t.assignee === m.id);
    return { name: m.name, color: m.color, done: memberTasks.filter(t => t.status === "done").length, total: memberTasks.length };
  }).filter(m => m.total > 0);

  const categoryBreakdown = CATEGORIES.map(cat => {
    const catTasks = tasks.filter(t => t.labels.includes(cat.label));
    return { label: cat.label, color: cat.color, done: catTasks.filter(t => t.status === "done").length, total: catTasks.length };
  }).filter(c => c.total > 0);

  const recentlyDone = tasks.filter(t => t.status === "done").slice(0, 3);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">진행률 분석</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalTasks ? `완료율 ${progressPct}%의 원인을 분석하고 완료 가능성을 판단합니다.` : "업무가 등록되면 완료율과 진행 현황을 분석합니다."}
          </p>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="전체 완료율" value={`${progressPct}%`} sub={`${doneTasks} / ${totalTasks} 완료`} color="#3B5BDB" icon={TrendingUp} />
        <DetailStatCard label="완료" value={doneTasks} sub={`전체 ${totalTasks}개 중`} color="#10B981" icon={CheckCircle2} />
        <DetailStatCard label="진행 중" value={inProgressTasks} sub="활성 업무" color="#7048E8" icon={Clock} />
        <DetailStatCard label="블로커" value={blockedTasks} sub="즉시 해결 필요" color="#EF4444" icon={AlertTriangle} />
      </div>

      {/* AI box */}
      <AIBox
        text={totalTasks
          ? `현재 완료율 ${progressPct}%입니다. 블로커 ${blockedTasks}건을 우선 해결하면 진행 속도를 높일 수 있습니다.`
          : "아직 등록된 업무가 없습니다. 회의록 AI에서 To-Do를 승인하면 진행률 분석이 표시됩니다."}
        onAsk={() => {}}
      />

      {/* main: circle + assignee */}
      <div className="grid grid-cols-2 gap-4">
        {/* circle progress */}
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <CircleProgress pct={progressPct} size={156} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-3xl font-bold text-foreground">{progressPct}%</div>
              <div className="text-[11px] text-muted-foreground">완료율</div>
            </div>
          </div>
          <div className="w-full border-t border-border pt-3 space-y-2">
            {[
              { label: "완료",   count: doneTasks, color: "#10B981" },
              { label: "진행 중", count: inProgressTasks, color: "#3B5BDB" },
              { label: "대기",   count: todoTasks, color: "#C1C9D9" },
              { label: "블로커", count: blockedTasks, color: "#EF4444" },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-muted-foreground">{s.label}</span>
                </div>
                <span className="font-semibold text-foreground">{s.count}개</span>
              </div>
            ))}
          </div>
          {recentlyDone.length > 0 && (
            <div className="w-full border-t border-border pt-3">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">최근 완료된 업무</div>
              {recentlyDone.map(t => {
                const m = MEMBERS.find(me => me.id === t.assignee) ?? MEMBERS[0];
                return (
                  <div key={t.id} className="flex items-center gap-2 py-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-xs text-foreground truncate flex-1">{t.title}</span>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ background: m.color }}>{m.initials}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* assignee completion */}
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm">
          <div className="text-sm font-semibold text-foreground mb-4">담당자별 완료 현황</div>
          {perMemberCompletion.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">담당 업무가 등록되면 표시됩니다.</div>
          ) : (
          <div className="space-y-4">
            {perMemberCompletion.map(m => {
              const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
              return (
                <div key={m.name}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: m.color }}>
                        {m.name[0]}
                      </div>
                      <span className="font-medium text-foreground">{m.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground font-mono">{m.done}/{m.total}</span>
                      <span className={`font-semibold ${pct >= 60 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-red-500"}`}>{pct}%</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: m.color }} />
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      </div>

      {/* type completion */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <div className="text-sm font-semibold text-foreground">업무 유형별 완료율</div>
        </div>
        {categoryBreakdown.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6">업무가 등록되면 유형별 완료율이 표시됩니다.</div>
        ) : (
        <div className="divide-y divide-border">
          {categoryBreakdown.map(c => {
            const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
            return (
              <div key={c.label} className="flex items-center gap-3 px-5 py-2.5">
                <div className="w-20 text-xs font-medium text-foreground shrink-0">{c.label}</div>
                <div className="flex-1 h-1.5 bg-muted rounded-full">
                  <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                </div>
                <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">{c.done}/{c.total}</span>
                <span className={`text-[10px] font-bold w-8 text-right ${pct === 100 ? "text-emerald-600" : pct === 0 ? "text-red-500" : "text-amber-600"}`}>{pct}%</span>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}

// ─── page 3: blockers ─────────────────────────────────────────────────────────
function BlockersPage({ onBack }: { onBack: () => void }) {
  const tasks = useStoredTasks();
  const blockedTasks = tasks.filter(t => t.status === "blocked");
  const daysDelayed = (task: Task) => {
    const daysLeft = getDaysLeft(task.dueDate);
    return daysLeft !== null && daysLeft < 0 ? Math.abs(daysLeft) : 0;
  };
  const avgDelay = blockedTasks.length
    ? Math.round((blockedTasks.reduce((sum, t) => sum + daysDelayed(t), 0) / blockedTasks.length) * 10) / 10
    : 0;
  const highSeverity = blockedTasks.filter(t => t.priority === "high").length;

  const resolveBlocker = (taskId: string) => {
    saveStoredTasks(getStoredTasks().map(t => t.id === taskId ? { ...t, status: "inprogress" } : t));
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">블로커 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">막힌 업무를 파악하고 해결 담당자와 기한을 지정해 위험을 제거합니다.</p>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="현재 블로커" value={blockedTasks.length} sub="해결 대기" color="#EF4444" icon={AlertTriangle} />
        <DetailStatCard label="심각도 높음" value={highSeverity} sub="즉각 조치 필요" color="#EF4444" icon={AlertCircle} />
        <DetailStatCard label="평균 지연" value={blockedTasks.length ? `${avgDelay}일` : "—"} sub="마감일 기준" color="#F59E0B" icon={Clock} />
        <DetailStatCard label="영향받는 업무" value={blockedTasks.length} sub="담당자 확인 필요" color="#7048E8" icon={Layers} />
      </div>

      {/* AI box */}
      <AIBox
        text={blockedTasks.length
          ? `블로커 ${blockedTasks.length}건이 해결 대기 중입니다. 담당자와 함께 원인을 확인하고 필요 시 재배정하세요.`
          : "현재 블로커가 없습니다. 업무 보드에서 업무를 블로커로 전환하면 이곳에 표시됩니다."}
        onAsk={() => {}}
      />

      {/* blocker cards */}
      {blockedTasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <div className="text-sm font-semibold text-foreground mb-1">해결 대기 중인 블로커가 없습니다</div>
          <div className="text-xs text-muted-foreground">업무 보드에서 진행 중 업무를 블로커로 전환하면 여기에서 관리할 수 있습니다.</div>
        </div>
      ) : (
      <div className="space-y-4">
        {blockedTasks.map(task => {
          const assignee = MEMBERS.find(m => m.id === task.assignee) ?? MEMBERS[0];
          const delay = daysDelayed(task);
          return (
            <div key={task.id} className="bg-card rounded-xl border-2 border-red-200 shadow-sm overflow-hidden">
              {/* card header */}
              <div className="flex items-start justify-between px-5 py-3.5 border-b border-red-100 bg-red-50/50">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <div className="flex items-center flex-wrap gap-1.5 mb-1">
                      <PriorityBadge priority={task.priority} />
                      {task.labels.map(l => <LabelBadge key={l} label={l} />)}
                      <span className="text-[10px] font-mono text-muted-foreground">{task.id}</span>
                    </div>
                    <div className="text-sm font-semibold text-foreground">{task.title}</div>
                  </div>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-red-100 text-red-700 shrink-0 whitespace-nowrap">
                  {delay > 0 ? `${delay}일째 지연` : `마감 ${task.dueDate}`}
                </span>
              </div>

              {/* card body */}
              <div className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1.5">담당자</div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: assignee.color }}>{assignee.initials}</div>
                      <span className="text-xs font-medium text-foreground">{assignee.name}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1.5">마감일</div>
                    <span className="text-xs text-foreground">{task.dueDate}</span>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1.5">우선순위</div>
                    <PriorityBadge priority={task.priority} />
                  </div>
                </div>

                {/* AI suggestion */}
                <div className="rounded-lg p-3 flex items-start gap-2.5 border" style={{ background: "rgba(112,72,232,0.05)", borderColor: "rgba(112,72,232,0.2)" }}>
                  <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#7048E8" }} />
                  <p className="text-xs leading-relaxed" style={{ color: "#5B3DC8" }}>이 업무는 블로커 상태입니다. 담당자와 원인을 확인하고 해결 후 블로커 해결 완료로 전환하세요.</p>
                </div>

                {/* actions */}
                <div className="flex items-center flex-wrap gap-2 pt-1 border-t border-border">
                  <button onClick={() => resolveBlocker(task.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-red-500 hover:bg-red-600 transition-colors">
                    <CheckCheck className="w-3.5 h-3.5" /> 해결 완료
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <Calendar className="w-3.5 h-3.5" /> 회의 안건 추가
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <MessageSquare className="w-3.5 h-3.5" /> 팀 코멘트
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

// ─── page 4: in-progress tasks ────────────────────────────────────────────────
function InProgressPage({ onBack }: { onBack: () => void }) {
  const tasks = useStoredTasks();
  const inProgressTasks = tasks.filter(t => t.status === "inprogress");

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <BackBtn onBack={onBack} />
          <h1 className="text-xl font-bold text-foreground">진행 중 업무 모니터링</h1>
          <p className="text-sm text-muted-foreground mt-0.5">현재 진행 중인 업무 상태를 파악하고 지연 가능성을 조기에 감지합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> 전체 업데이트 요청
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ background: "var(--primary)" }}>
            <Plus className="w-3.5 h-3.5" /> 업무 추가
          </button>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="진행 중" value={inProgressTasks.length} sub="활성 업무" color="#3B5BDB" icon={Clock} />
        <DetailStatCard label="업데이트 필요" value="2" sub="3일 이상 미업데이트" color="#F59E0B" icon={AlertTriangle} />
        <DetailStatCard label="지연 위험" value="1" sub="고위험 업무" color="#EF4444" icon={AlertCircle} />
        <DetailStatCard label="마감까지" value="D-18" sub="2024.12.28" color="#7048E8" icon={Calendar} />
      </div>

      {/* AI box */}
      <AIBox
        text={inProgressTasks.length
          ? `현재 진행 중 업무 ${inProgressTasks.length}개가 있습니다. 팀장은 담당자별 진행 상황을 확인하고 지연 위험이 있는 업무를 블로커로 전환할 수 있습니다.`
          : "현재 진행 중인 업무가 없습니다. 회의록 AI에서 업무를 등록하면 업무 보드에서 상태를 진행 중으로 변경할 수 있습니다."}
        onAsk={() => {}}
      />

      {/* legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        {[
          { color: "#EF4444", label: "지연 위험" },
          { color: "#F59E0B", label: "업데이트 필요 (3일↑)" },
          { color: "#3B5BDB", label: "정상 진행" },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* task cards */}
      <div className="space-y-3">
        {inProgressTasks.map(task => {
          const member = MEMBERS.find(m => m.id === task.assignee) ?? MEMBERS[0];
          const meta = { startDate: "-", lastUpdate: "-", stale: false, riskLevel: "low" as const, nextAction: "담당자 진행 상황 확인", note: "" };
          const borderColor = meta.riskLevel === "high" ? "#EF4444" : meta.stale ? "#F59E0B" : "#DFE1E6";
          const bgColor    = meta.riskLevel === "high" ? "rgba(239,68,68,0.03)" : meta.stale ? "rgba(245,158,11,0.03)" : "white";

          return (
            <div key={task.id} className="rounded-xl shadow-sm overflow-hidden border"
              style={{ borderColor, borderLeftWidth: 4, background: bgColor }}>
              <div className="p-5">
                {/* top row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                      style={{ background: member.color }}>
                      {member.initials}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-[10px] text-muted-foreground">{task.id}</span>
                        {task.labels.map(l => <LabelBadge key={l} label={l} />)}
                        {meta.riskLevel === "high" && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">지연 위험</span>
                        )}
                        {meta.stale && meta.riskLevel !== "high" && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">업데이트 필요</span>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-foreground">{task.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{member.name} · 시작 {meta.startDate}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-medium px-2 py-1 rounded-lg ${meta.stale ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                      마지막 업데이트 {meta.lastUpdate}
                    </span>
                    <span className="text-xs font-semibold text-foreground bg-muted px-2 py-1 rounded-lg">
                      마감 {task.dueDate}
                    </span>
                  </div>
                </div>

                {/* note */}
                {meta.note && (
                  <div className="text-xs text-muted-foreground mb-3 px-3 py-2 rounded-lg bg-muted/60 border border-border">
                    {meta.note}
                  </div>
                )}

                {/* next action */}
                <div className="flex items-center gap-2 mb-4 text-xs">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">다음 액션</span>
                  <ArrowRight className="w-3 h-3 text-blue-500 shrink-0" />
                  <span className="text-foreground">{meta.nextAction}</span>
                </div>

                {/* actions */}
                <div className="flex items-center flex-wrap gap-2 pt-3 border-t border-border">
                  {meta.stale && (
                    <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-amber-500 hover:bg-amber-600 transition-colors">
                      <Bell className="w-3.5 h-3.5" /> 업데이트 요청
                    </button>
                  )}
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> 완료 처리
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> 블로커 전환
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <MessageSquare className="w-3.5 h-3.5" /> 코멘트
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors">
                    <Calendar className="w-3.5 h-3.5" /> 마감 조정
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ml-auto transition-opacity hover:opacity-80"
                    style={{ background: "rgba(112,72,232,0.12)", color: "#7048E8" }}>
                    <Sparkles className="w-3.5 h-3.5" /> AI에게 질문
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── page 5: dash progress ────────────────────────────────────────────────────
function DashProgressPage({ onBack, onGoUrgent }: { onBack: () => void; onGoUrgent: () => void }) {
  const tasks = useStoredTasks();
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const inProgressTasks = tasks.filter(t => t.status === "inprogress").length;
  const blockedTasks = tasks.filter(t => t.status === "blocked").length;
  const todoTasks = tasks.filter(t => t.status === "todo").length;
  const progressPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const categoryBreakdown = CATEGORIES.map(cat => {
    const catTasks = tasks.filter(t => t.labels.includes(cat.label));
    return { label: cat.label, color: cat.color, done: catTasks.filter(t => t.status === "done").length, total: catTasks.length };
  }).filter(c => c.total > 0);

  const upcoming = tasks
    .filter(t => t.status !== "done")
    .map(t => ({ task: t, daysLeft: getDaysLeft(t.dueDate) }))
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity))
    .slice(0, 5);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div><BackBtn onBack={onBack} /><h1 className="text-xl font-bold text-foreground">전체 진행률</h1><p className="text-sm text-muted-foreground mt-0.5">프로젝트 진행 현황을 분석하고 지연 위험을 파악합니다.</p></div>
        <div className="flex items-center gap-2">
          <button onClick={onGoUrgent} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-red-200 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"><AlertTriangle className="w-3.5 h-3.5" />지연 업무 바로가기</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="전체 완료율" value={`${progressPct}%`} sub={`${doneTasks} / ${totalTasks} 완료`} color="#3B5BDB" icon={TrendingUp} />
        <DetailStatCard label="진행 중" value={inProgressTasks} sub="활성 업무" color="#7048E8" icon={Clock} />
        <DetailStatCard label="블로커" value={blockedTasks} sub="즉시 검토 필요" color="#EF4444" icon={AlertTriangle} />
        <DetailStatCard label="대기" value={todoTasks} sub="시작 전 업무" color="#F59E0B" icon={Layers} />
      </div>

      <AIBox text={totalTasks
        ? `현재 완료율 ${progressPct}%, 블로커 ${blockedTasks}건입니다. 블로커를 우선 해결하면 전체 진행 속도를 높일 수 있습니다.`
        : "아직 등록된 업무가 없습니다. 회의록 AI에서 To-Do를 승인하면 전체 진행률이 표시됩니다."} onAsk={() => {}} />

      <div className="grid grid-cols-2 gap-4">
        {/* Category progress */}
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="text-sm font-semibold text-foreground mb-4">카테고리별 진행 상태</div>
          {categoryBreakdown.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">업무가 등록되면 카테고리별 진행 상태가 표시됩니다.</div>
          ) : (
          <div className="space-y-3.5">
            {categoryBreakdown.map(c => {
              const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
              return (
                <div key={c.label}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-foreground">{c.label}</span>
                    <span className={`font-semibold ${pct === 100 ? "text-emerald-600" : pct >= 50 ? "text-blue-600" : pct > 0 ? "text-amber-600" : "text-muted-foreground"}`}>{pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: c.color }} />
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>

        {/* Upcoming tasks */}
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="text-sm font-semibold text-foreground mb-4">마감 임박 업무</div>
          {upcoming.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">진행 중인 업무가 없습니다.</div>
          ) : (
          <div className="space-y-3">
            {upcoming.map(({ task, daysLeft }) => {
              const m = MEMBERS.find(me => me.id === task.assignee) ?? MEMBERS[0];
              return (
                <div key={task.id} className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ background: m.color }}>{m.initials}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{task.title}</div>
                    <div className="text-[10px] text-muted-foreground">{m.name} · 마감 {task.dueDate}</div>
                  </div>
                  <span className={`text-xs font-bold shrink-0 ${daysLeft !== null && daysLeft < 0 ? "text-red-600" : daysLeft !== null && daysLeft <= 3 ? "text-amber-600" : "text-muted-foreground"}`}>{formatDaysLeft(daysLeft)}</span>
                </div>
              );
            })}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── page 6: urgent tasks ─────────────────────────────────────────────────────
function UrgentTasksPage({ onBack }: { onBack: () => void }) {
  const tasks = useStoredTasks();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("전체");

  const urgentTasks = tasks.filter(t => t.status !== "done").filter(t => {
    const mq = !search || t.title.toLowerCase().includes(search.toLowerCase());
    const ma = assigneeFilter === "전체" || MEMBERS.find(m => m.id === t.assignee)?.name === assigneeFilter;
    return mq && ma;
  });
  const getUrgency = (task: Task) => getUrgencyFromDaysLeft(getDaysLeft(task.dueDate));

  const groups = [
    { label: "⚫ 이미 지연", urgency: "overdue", color: "#6B7280", bg: "bg-slate-50 border-slate-200" },
    { label: "🔴 오늘 마감", urgency: "today",  color: "#EF4444", bg: "bg-red-50 border-red-200" },
    { label: "🟠 3일 이내",  urgency: "3day",   color: "#F97316", bg: "bg-orange-50 border-orange-200" },
    { label: "🟡 7일 이내",  urgency: "week",   color: "#F59E0B", bg: "bg-amber-50 border-amber-200" },
    { label: "🟢 여유 있음", urgency: "normal", color: "#10B981", bg: "bg-emerald-50 border-emerald-200" },
  ];

  const selectedTask = tasks.find(t => t.id === selected);
  const selectedDaysLeft = selectedTask ? getDaysLeft(selectedTask.dueDate) : null;
  const selectedMember = selectedTask ? (MEMBERS.find(m => m.id === selectedTask.assignee) ?? MEMBERS[0]) : null;

  const urgencyCount = (u: string) => urgentTasks.filter(t => getUrgency(t) === u).length;

  return (
    <div className="h-full overflow-hidden flex flex-col p-6 gap-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between shrink-0">
        <div><BackBtn onBack={onBack} /><h1 className="text-xl font-bold text-foreground">마감 임박 업무</h1><p className="text-sm text-muted-foreground mt-0.5">마감이 가까운 업무와 지연된 업무를 우선순위별로 관리합니다.</p></div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><Bell className="w-3.5 h-3.5" />일괄 리마인드</button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}><Sparkles className="w-3.5 h-3.5" />AI 마감 위험 분석</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 shrink-0">
        <DetailStatCard label="오늘 마감" value={urgencyCount("today")} sub="즉시 확인 필요" color="#EF4444" icon={AlertCircle} />
        <DetailStatCard label="3일 이내" value={urgencyCount("3day")} sub="긴급 처리 필요" color="#F97316" icon={AlertTriangle} />
        <DetailStatCard label="7일 이내" value={urgencyCount("week")} sub="이번 주 완료 목표" color="#F59E0B" icon={Clock} />
        <DetailStatCard label="이미 지연" value={urgencyCount("overdue")} sub="즉시 담당자 확인" color="#6B7280" icon={AlertTriangle} />
      </div>

      <AIBox text={urgentTasks.length ? `마감 전 업무 ${urgentTasks.length}개가 남아 있습니다. 팀장은 담당자별 마감일을 확인하고 필요 시 리마인드 또는 일정 조정을 진행하세요.` : "마감 임박 업무가 없습니다. 회의록 AI에서 업무를 등록하면 마감일 기준으로 자동 분류됩니다."} onAsk={() => {}} />

      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="업무명 검색..." className="pl-9 pr-4 py-2 text-xs rounded-lg border border-border bg-card outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 w-48" />
        </div>
        <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="text-xs border border-border rounded-lg px-3 py-2 bg-card text-foreground outline-none">
          <option>전체</option>{MEMBERS.map(m => <option key={m.id}>{m.name}</option>)}
        </select>
        <div className="ml-auto text-xs text-muted-foreground">{urgentTasks.length}개 업무</div>
      </div>

      <div className="flex-1 overflow-hidden flex gap-4 min-h-0">
        {/* Task list */}
        <div className="flex-1 overflow-y-auto space-y-3">
          {groups.map(g => {
            const tasks = urgentTasks.filter(t => getUrgency(t) === g.urgency);
            if (!tasks.length) return null;
            return (
              <div key={g.urgency}>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold mb-2 ${g.bg}`} style={{ color: g.color }}>{g.label} ({tasks.length})</div>
                <div className="space-y-2">
                  {tasks.map(task => {
                    const member = MEMBERS.find(m => m.id === task.assignee) ?? MEMBERS[0];
                    const daysLeft = getDaysLeft(task.dueDate);
                    const isSelected = selected === task.id;
                    return (
                      <div key={task.id} onClick={() => setSelected(task.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? "border-blue-400 bg-blue-50/50" : "bg-card border-border hover:border-slate-300 hover:shadow-sm"}`}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: member.color }}>{member.initials}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className="font-mono text-[10px] text-muted-foreground">{task.id}</span>
                            <StatusBadge2 status={task.status} />
                            <PriorityBadge priority={task.priority} />
                            {task.status === "blocked" && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700">블로커</span>}
                          </div>
                          <div className="text-xs font-medium text-foreground truncate">{task.title}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{member.name} · 마감 {task.dueDate}</div>
                        </div>
                        <div className="shrink-0 text-center">
                          <div className="text-lg font-bold" style={{ color: g.color }}>{formatDaysLeft(daysLeft)}</div>
                          <div className="text-[9px] text-muted-foreground">남은 일수</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selectedTask && selectedMember && (
          <div className="w-72 shrink-0 bg-card border border-border rounded-xl overflow-y-auto">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[10px] text-muted-foreground">{selectedTask.id}</span>
                <StatusBadge2 status={selectedTask.status} />
              </div>
              <div className="text-sm font-semibold text-foreground leading-snug">{selectedTask.title}</div>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><div className="text-[10px] text-muted-foreground mb-1">담당자</div>
                  <div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: selectedMember.color }}>{selectedMember.initials}</div><span className="font-medium text-foreground">{selectedMember.name}</span></div>
                </div>
                <div><div className="text-[10px] text-muted-foreground mb-1">우선순위</div><PriorityBadge priority={selectedTask.priority} /></div>
                <div><div className="text-[10px] text-muted-foreground mb-1">마감일</div><span className="font-semibold text-foreground">{selectedTask.dueDate}</span></div>
                <div><div className="text-[10px] text-muted-foreground mb-1">남은 시간</div><span className="font-bold" style={{ color: selectedDaysLeft !== null && selectedDaysLeft <= 3 ? "#EF4444" : "#F59E0B" }}>{formatDaysLeft(selectedDaysLeft)}</span></div>
              </div>
              <div className="flex flex-wrap gap-1">{selectedTask.labels.map(l => <LabelBadge key={l} label={l} />)}</div>
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">빠른 액션</div>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"><Bell className="w-3.5 h-3.5" />리마인드 알림 보내기</button>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><User className="w-3.5 h-3.5" />담당자 변경</button>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><Calendar className="w-3.5 h-3.5" />마감일 수정</button>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />완료 처리</button>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium border border-red-200 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"><AlertTriangle className="w-3.5 h-3.5" />블로커로 지정</button>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><MessageSquare className="w-3.5 h-3.5" />코멘트 작성</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── page 7: workload ─────────────────────────────────────────────────────────
function WorkloadPage({ onBack }: { onBack: () => void }) {
  const tasks = useStoredTasks();
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  const memberTasks = (id: string) => ({
    total:    tasks.filter(t => t.assignee === id).length,
    done:     tasks.filter(t => t.assignee === id && t.status === "done").length,
    inprog:   tasks.filter(t => t.assignee === id && t.status === "inprogress").length,
    blocked:  tasks.filter(t => t.assignee === id && t.status === "blocked").length,
    todo:     tasks.filter(t => t.assignee === id && t.status === "todo").length,
    list:     tasks.filter(t => t.assignee === id),
  });

  const overloadedMembers = MEMBERS.filter(m => {
    const t = memberTasks(m.id);
    return t.blocked > 0 && t.inprog >= 2;
  });
  const mostLoaded = MEMBERS.map(m => ({ m, t: memberTasks(m.id) })).sort((a, b) => b.t.inprog - a.t.inprog)[0];
  const avgPerMember = MEMBERS.length ? (tasks.length / MEMBERS.length) : 0;
  const overallBalance = tasks.length === 0 ? "데이터 없음" : overloadedMembers.length > 0 ? "재배정 필요" : "양호";
  const aiRec = tasks.length === 0
    ? "아직 등록된 업무가 없습니다. 회의록 AI에서 To-Do를 승인하면 팀원별 업무량이 표시됩니다."
    : mostLoaded && mostLoaded.t.inprog > 0
      ? `${mostLoaded.m.name}님의 진행 중 업무가 ${mostLoaded.t.inprog}개로 가장 많습니다.${mostLoaded.t.blocked > 0 ? ` 블로커 ${mostLoaded.t.blocked}개가 포함되어 있어 재배정을 검토하세요.` : ""}`
      : "현재 팀원별 업무량이 고르게 분배되어 있습니다.";

  const barData = MEMBERS.map(m => {
    const t = memberTasks(m.id);
    return { name: m.name, 완료: t.done, 진행중: t.inprog, 대기: t.todo, 블로커: t.blocked };
  });

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div><BackBtn onBack={onBack} /><h1 className="text-xl font-bold text-foreground">팀원별 업무량</h1><p className="text-sm text-muted-foreground mt-0.5">팀원별 업무 분배 현황을 파악하고 과부하 위험을 확인합니다.</p></div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border bg-card text-foreground rounded-lg hover:bg-muted transition-colors"><Plus className="w-3.5 h-3.5" />업무 배정</button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg" style={{ background: "linear-gradient(135deg,#7048E8,#4F6EF7)" }}><Sparkles className="w-3.5 h-3.5" />AI 균형 추천</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="팀원 수" value={`${MEMBERS.length}명`} sub="팀장 포함" color="#3B5BDB" icon={Users} />
        <DetailStatCard label="1인 평균 업무" value={`${avgPerMember.toFixed(1)}개`} sub="전체 기준" color="#7048E8" icon={Layers} />
        <DetailStatCard label="과부하 위험" value={`${overloadedMembers.length}명`} sub={overloadedMembers.length ? overloadedMembers.map(m => m.name).join(", ") : "없음"} color="#EF4444" icon={AlertTriangle} />
        <DetailStatCard label="업무 균형" value={overallBalance} sub={tasks.length === 0 ? "업무 등록 후 표시" : overloadedMembers.length ? "재배정 검토 필요" : "안정적"} color="#F59E0B" icon={BarChart3} />
      </div>

      {/* AI recommendation */}
      <AIBox text={aiRec} onAsk={() => {}} />

      <div className="grid grid-cols-3 gap-4">
        {/* Workload bar chart */}
        <div className="col-span-2 bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">팀원별 업무 현황 비교</div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {[{ color: "#10B981", l: "완료" }, { color: "#3B5BDB", l: "진행중" }, { color: "#C1C9D9", l: "대기" }, { color: "#EF4444", l: "블로커" }].map(x => (
                <span key={x.l} className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{ background: x.color }} />{x.l}</span>
              ))}
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                <CartesianGrid key="cg" strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis key="x" dataKey="name" tick={{ fontSize: 10, fill: "#8892A4" }} />
                <YAxis key="y" tick={{ fontSize: 10, fill: "#8892A4" }} />
                <Tooltip key="tt" contentStyle={{ fontSize: 12, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                <Bar key="b1" dataKey="완료"  stackId="a" fill="#10B981" radius={[0,0,0,0]} />
                <Bar key="b2" dataKey="진행중" stackId="a" fill="#3B5BDB" radius={[0,0,0,0]} />
                <Bar key="b3" dataKey="대기"  stackId="a" fill="#C1C9D9" radius={[0,0,0,0]} />
                <Bar key="b4" dataKey="블로커" stackId="a" fill="#EF4444" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Progress comparison */}
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="text-sm font-semibold text-foreground mb-4">완료율 비교</div>
          <div className="space-y-4">
            {MEMBERS.map(m => {
              const t = memberTasks(m.id);
              const pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
              const isOverload = t.blocked > 0 && t.inprog >= 2;
              return (
                <div key={m.id}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: m.color }}>{m.initials}</div>
                      <span className="font-medium text-foreground">{m.name}</span>
                      {isOverload && <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-red-100 text-red-600">과부하</span>}
                    </div>
                    <span className={`font-semibold ${pct >= 60 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-red-500"}`}>{pct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full">
                    <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: m.color }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{t.done}/{t.total}개 · 블로커 {t.blocked}개</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Member cards */}
      <div className="grid grid-cols-2 gap-4">
        {MEMBERS.map(m => {
          const t = memberTasks(m.id);
          const pct = Math.round((t.done / t.total) * 100);
          const isSelected = selectedMember === m.id;
          const isOverload = t.blocked > 0 && t.inprog >= 2;
          return (
            <div key={m.id} onClick={() => setSelectedMember(isSelected ? null : m.id)}
              className={`bg-card rounded-xl p-5 border-2 cursor-pointer transition-all shadow-sm hover:shadow-md ${isSelected ? "border-blue-400" : isOverload ? "border-red-200" : "border-border"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ background: m.color }}>{m.initials}</div>
                  <div><div className="text-sm font-semibold text-foreground">{m.name}</div><div className="text-xs text-muted-foreground">{m.role}</div></div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {isOverload && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">과부하 위험</span>}
                  <span className={`text-lg font-bold ${pct >= 60 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-red-500"}`}>{pct}%</span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[{ l: "전체", v: t.total, c: "#3B5BDB" }, { l: "완료", v: t.done, c: "#10B981" }, { l: "진행중", v: t.inprog, c: "#3B5BDB" }, { l: "블로커", v: t.blocked, c: "#EF4444" }].map(s => (
                  <div key={s.l} className="text-center p-1.5 rounded-lg bg-muted">
                    <div className="text-sm font-bold" style={{ color: s.c }}>{s.v}</div>
                    <div className="text-[9px] text-muted-foreground">{s.l}</div>
                  </div>
                ))}
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full"><div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: m.color }} /></div>
              {isSelected && (
                <div className="mt-3 pt-3 border-t border-border flex gap-2">
                  <button className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors">업무 재배정</button>
                  <button className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors">업무 목록 보기</button>
                  <button className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors">코멘트</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected member task list */}
      {selectedMember && (() => {
        const m = MEMBERS.find(mem => mem.id === selectedMember)!;
        const tasks = memberTasks(selectedMember).list;
        return (
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: m.color }}>{m.initials}</div>
                <span className="text-sm font-semibold text-foreground">{m.name}님의 업무 목록</span>
              </div>
              <button onClick={() => setSelectedMember(null)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="divide-y divide-border">
              {tasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                  <span className="font-mono text-[10px] text-muted-foreground w-12">{task.id}</span>
                  <span className="flex-1 text-xs font-medium text-foreground truncate">{task.title}</span>
                  <StatusBadge2 status={task.status} />
                  <PriorityBadge priority={task.priority} />
                  <span className="text-xs text-muted-foreground w-10 text-right">{task.dueDate}</span>
                  <button className="text-[11px] font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap">재배정</button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── page 8: activity ─────────────────────────────────────────────────────────
const ACTIVITY_ICONS: Record<ActivityType, { icon: any; color: string; bg: string; label: string }> = {
  task_create: { icon: Plus,           color: "#7048E8", bg: "rgba(112,72,232,0.1)", label: "업무 생성" },
  meeting:     { icon: FileAudio,      color: "#7048E8", bg: "rgba(112,72,232,0.1)", label: "회의록" },
  ai:          { icon: Sparkles,       color: "#7048E8", bg: "rgba(112,72,232,0.15)", label: "AI" },
};

function ActivityPage({ onBack }: { onBack: () => void }) {
  const tasks = useStoredTasks();
  const meetings = useStoredMeetings();
  const [typeFilter, setTypeFilter] = useState("전체");
  const [memberFilter, setMemberFilter] = useState("전체");
  const [search, setSearch] = useState("");

  const activityLog: Activity[] = [
    ...meetings.flatMap(m => [
      { id: `meeting-${m.id}`, type: "meeting" as ActivityType, actor: "회의록 AI", time: m.date, message: `${m.title} 회의록 업로드`, target: m.title },
      ...(m.status === "processed" ? [{ id: `ai-${m.id}`, type: "ai" as ActivityType, actor: "AI", time: m.date, message: `${m.title} AI 분석 완료`, target: m.title }] : []),
    ]),
    ...tasks.map(task => {
      const member = MEMBERS.find(mem => mem.id === task.assignee);
      return { id: `task-${task.id}`, type: "task_create" as ActivityType, actor: member?.name ?? "팀장", time: `마감 ${task.dueDate}`, message: `${task.title} 업무 등록`, target: task.id };
    }),
  ];

  const typeFilters = ["전체", "업무", "회의록", "AI"];
  const typeMap: Record<string, ActivityType[]> = {
    "업무":   ["task_create"],
    "회의록": ["meeting"],
    "AI":     ["ai"],
  };

  const filtered = activityLog.filter(a => {
    const mt = typeFilter === "전체" || typeMap[typeFilter]?.includes(a.type);
    const mm = memberFilter === "전체" || a.actor === memberFilter;
    const ms = !search || a.message.toLowerCase().includes(search.toLowerCase());
    return mt && mm && ms;
  });

  const taskCount = activityLog.filter(a => a.type === "task_create").length;
  const meetingCount = activityLog.filter(a => a.type === "meeting").length;
  const aiCount = activityLog.filter(a => a.type === "ai").length;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
      <div className="flex items-start justify-between">
        <div><BackBtn onBack={onBack} /><h1 className="text-xl font-bold text-foreground">최근 활동</h1><p className="text-sm text-muted-foreground mt-0.5">팀 전체 활동을 타임라인으로 확인하고 중요 변경사항을 파악합니다.</p></div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <DetailStatCard label="전체 활동" value={activityLog.length} sub="누적 기록" color="#3B5BDB" icon={Zap} />
        <DetailStatCard label="업무 등록" value={taskCount} sub="회의록 AI + 직접 생성" color="#7048E8" icon={Plus} />
        <DetailStatCard label="회의록 업로드" value={meetingCount} sub="누적 건수" color="#10B981" icon={FileAudio} />
        <DetailStatCard label="AI 분석 완료" value={aiCount} sub="자동 생성 항목" color="#7048E8" icon={Sparkles} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {typeFilters.map(f => (
          <button key={f} onClick={() => setTypeFilter(f)} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${typeFilter === f ? "bg-blue-600 text-white border-blue-600" : "bg-card border-border text-muted-foreground hover:border-slate-300"}`}>{f}</button>
        ))}
        <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)} className="ml-2 text-xs border border-border rounded-lg px-3 py-2 bg-card text-foreground outline-none">
          <option>전체</option>{MEMBERS.map(m => <option key={m.id}>{m.name}</option>)}<option>회의록 AI</option><option>AI</option>
        </select>
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="활동 검색..." className="pl-9 pr-4 py-2 text-xs rounded-lg border border-border bg-card outline-none focus:border-blue-400 w-44" />
        </div>
      </div>

      <div className="space-y-1">
        {filtered.map((a, i) => {
          const meta = ACTIVITY_ICONS[a.type];
          const IconComp = meta.icon;
          const actorMember = MEMBERS.find(m => m.name === a.actor);
          const isLast = i === filtered.length - 1;
          return (
            <div key={a.id} className="flex gap-3">
              {/* timeline line */}
              <div className="flex flex-col items-center shrink-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: meta.bg }}>
                  <IconComp className="w-3.5 h-3.5" style={{ color: meta.color }} />
                </div>
                {!isLast && <div className="w-0.5 flex-1 bg-border my-1" />}
              </div>
              {/* content */}
              <div className="flex-1 bg-card border border-border rounded-xl p-3 hover:shadow-sm transition-shadow mb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                      {actorMember && (
                        <div className="flex items-center gap-1">
                          <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ background: actorMember.color }}>{actorMember.initials}</div>
                          <span className="text-[10px] font-medium text-foreground">{a.actor}</span>
                        </div>
                      )}
                      {!actorMember && <span className="text-[10px] font-medium" style={{ color: meta.color }}>{a.actor}</span>}
                    </div>
                    <div className="text-xs text-foreground leading-relaxed">{a.message}</div>
                    {a.target && <div className="mt-1"><span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{a.target}</span></div>}
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{a.time}</span>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground">
            <Zap className="w-8 h-8 text-slate-300 mb-3" />
            <div className="text-sm font-semibold text-foreground mb-1">아직 활동 기록이 없습니다</div>
            <div className="text-xs">회의록 분석 또는 업무 등록 후 활동이 표시됩니다.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── auth & onboarding ───────────────────────────────────────────────────────
type Screen = "login" | "signup" | "onboarding" | "dashboard";

/* shared input component */
function Input({ label, type = "text", placeholder, value, onChange, icon: Icon, right }: {
  label: string; type?: string; placeholder: string;
  value: string; onChange: (v: string) => void;
  icon?: any; right?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-foreground">{label}</label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl border border-border bg-input-background text-sm text-foreground placeholder-muted-foreground outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          style={{ padding: Icon ? "10px 12px 10px 36px" : "10px 12px" }}
        />
        {right && <div className="absolute right-3 top-1/2 -translate-y-1/2">{right}</div>}
      </div>
    </div>
  );
}

/* left brand panel shared by login & signup */
function AuthBrandPanel() {
  return (
    <div className="relative w-[42%] flex flex-col justify-between p-10 overflow-hidden" style={{ background: "linear-gradient(145deg, #111827 0%, #1A2035 50%, #1E2D5A 100%)" }}>
      {/* decorative blobs */}
      <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #7048E8, transparent)" }} />
      <div className="absolute bottom-10 -left-16 w-64 h-64 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #4F6EF7, transparent)" }} />
      <div className="absolute top-1/2 right-8 w-40 h-40 rounded-full opacity-5" style={{ background: "radial-gradient(circle, #10B981, transparent)" }} />

      {/* logo */}
      <div>
        <div className="flex items-center gap-3 mb-12">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-base" style={{ background: "linear-gradient(135deg, #7048E8, #4F6EF7)" }}>
            TF
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-none">TeamFlow</div>
            <div className="text-xs font-medium mt-0.5" style={{ color: "#A78BFA" }}>AI Powered</div>
          </div>
        </div>

        <h2 className="text-white font-bold leading-snug mb-3" style={{ fontSize: "1.6rem" }}>
          팀 프로젝트의<br />모든 흐름을<br /><span style={{ color: "#818CF8" }}>AI가 연결합니다.</span>
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "#94A3B8" }}>
          회의록부터 업무, GitHub, 산출물, 기여도 평가까지<br />하나의 플랫폼에서 완성하세요.
        </p>
      </div>

      {/* feature list */}
      <div className="space-y-4">
        {[
          { icon: FileAudio, label: "회의록 AI 자동 요약", desc: "업로드만 하면 To-Do·일정 자동 생성" },
          { icon: Sparkles, label: "AI 어시스턴트", desc: "프로젝트 전체 데이터 기반 질문 답변" },
          { icon: Shield, label: "기여도 평가 보조", desc: "심사자 전용 개인별 근거 리포트 제공" },
        ].map(f => (
          <div key={f.label} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(112,72,232,0.25)" }}>
              <f.icon className="w-4 h-4" style={{ color: "#A78BFA" }} />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{f.label}</div>
              <div className="text-xs mt-0.5" style={{ color: "#64748B" }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── login ── */
function LoginScreen({ onLogin, onGoSignup }: { onLogin: () => void; onGoSignup: () => void }) {
  const [email, setEmail] = useState("kim.minjun@university.ac.kr");
  const [pw, setPw] = useState("••••••••");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);

  const handleSubmit = () => {
    if (!email || !pw) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin(); }, 1000);
  };

  return (
    <div className="flex h-screen" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <AuthBrandPanel />

      {/* right form panel */}
      <div className="flex-1 flex items-center justify-center bg-background px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-1">다시 만나서 반가워요!</h1>
            <p className="text-sm text-muted-foreground">계속하려면 로그인하세요.</p>
          </div>

          <div className="space-y-4">
            <Input label="이메일" type="email" placeholder="name@university.ac.kr" value={email} onChange={setEmail} icon={Mail} />
            <Input
              label="비밀번호" type={showPw ? "text" : "password"} placeholder="비밀번호 입력"
              value={pw} onChange={setPw} icon={Lock}
              right={
                <button onClick={() => setShowPw(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
          </div>

          <div className="flex items-center justify-between mt-3 mb-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div onClick={() => setRemember(v => !v)}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-all cursor-pointer ${remember ? "border-blue-500 bg-blue-500" : "border-border"}`}>
                {remember && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-xs text-muted-foreground">로그인 유지</span>
            </label>
            <button className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">비밀번호 찾기</button>
          </div>

          <button onClick={handleSubmit} disabled={loading}
            className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-70 hover:opacity-90 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #3B5BDB 0%, #4F6EF7 100%)" }}>
            {loading ? (
              <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> 로그인 중...</>
            ) : (
              <><ArrowRight className="w-4 h-4" /> 로그인</>
            )}
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">또는</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <p className="text-center text-sm text-muted-foreground">
            아직 계정이 없으신가요?{" "}
            <button onClick={onGoSignup} className="font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              회원가입
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── signup ── */
function SignupScreen({ onSignup, onGoLogin }: { onSignup: () => void; onGoLogin: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const pwMatch = pw && pwConfirm && pw === pwConfirm;
  const pwMismatch = pw && pwConfirm && pw !== pwConfirm;
  const valid = name && email && pw && pwMatch && agreed;

  const handleSubmit = () => {
    if (!valid) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); onSignup(); }, 1000);
  };

  return (
    <div className="flex h-screen" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <AuthBrandPanel />

      <div className="flex-1 flex items-center justify-center bg-background px-8 overflow-y-auto">
        <div className="w-full max-w-sm py-8">
          <div className="mb-7">
            <h1 className="text-2xl font-bold text-foreground mb-1">TeamFlow AI 시작하기</h1>
            <p className="text-sm text-muted-foreground">팀 프로젝트를 스마트하게 관리해보세요.</p>
          </div>

          <div className="space-y-4">
            <Input label="이름" placeholder="실명을 입력하세요" value={name} onChange={setName} icon={User} />
            <Input label="이메일" type="email" placeholder="name@university.ac.kr" value={email} onChange={setEmail} icon={Mail} />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">비밀번호</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="8자 이상 입력"
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  className="w-full rounded-xl border border-border bg-input-background text-sm text-foreground placeholder-muted-foreground outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  style={{ padding: "10px 36px 10px 36px" }}
                />
                <button onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">비밀번호 확인</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  placeholder="비밀번호를 다시 입력"
                  value={pwConfirm}
                  onChange={e => setPwConfirm(e.target.value)}
                  className={`w-full rounded-xl border text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 transition-all bg-input-background ${pwMismatch ? "border-red-400 focus:ring-red-100" : pwMatch ? "border-emerald-400 focus:ring-emerald-100" : "border-border focus:border-blue-400 focus:ring-blue-100"}`}
                  style={{ padding: "10px 36px 10px 36px" }}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {pwMatch && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {pwMismatch && <AlertTriangle className="w-4 h-4 text-red-400" />}
                </div>
              </div>
              {pwMismatch && <span className="text-xs text-red-500">비밀번호가 일치하지 않습니다.</span>}
            </div>
          </div>

          <label className="flex items-start gap-2 mt-5 mb-6 cursor-pointer select-none">
            <div onClick={() => setAgreed(v => !v)}
              className={`w-4 h-4 rounded border flex items-center justify-center transition-all mt-0.5 cursor-pointer shrink-0 ${agreed ? "border-blue-500 bg-blue-500" : "border-border"}`}>
              {agreed && <Check className="w-3 h-3 text-white" />}
            </div>
            <span className="text-xs text-muted-foreground leading-relaxed">
              <button className="font-semibold text-blue-600 hover:text-blue-700">이용약관</button> 및{" "}
              <button className="font-semibold text-blue-600 hover:text-blue-700">개인정보처리방침</button>에 동의합니다.
            </span>
          </label>

          <button onClick={handleSubmit} disabled={!valid || loading}
            className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 hover:opacity-90 flex items-center justify-center gap-2"
            style={{ background: valid ? "linear-gradient(135deg, #3B5BDB 0%, #4F6EF7 100%)" : "#C1C9D9" }}>
            {loading ? (
              <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> 가입 중...</>
            ) : (
              <><ArrowRight className="w-4 h-4" /> 가입하기</>
            )}
          </button>

          <p className="text-center text-sm text-muted-foreground mt-4">
            이미 계정이 있으신가요?{" "}
            <button onClick={onGoLogin} className="font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              로그인
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── onboarding ── */
const PROJECT_TYPES = [
  { id: "capstone", label: "캡스톤디자인", sub: "전공 프로젝트", icon: GraduationCap, color: "#3B5BDB" },
  { id: "team",     label: "팀프로젝트",   sub: "일반 팀프로젝트", icon: Users,           color: "#7048E8" },
  { id: "contest",  label: "공모전",        sub: "아이디어·창업",   icon: Trophy,          color: "#F59E0B" },
  { id: "ai",       label: "AI 경진대회",   sub: "모델·실험 중심",  icon: Cpu,             color: "#10B981" },
  { id: "hackathon",label: "해커톤",        sub: "단기 집중 개발",  icon: Zap,             color: "#EF4444" },
  { id: "other",    label: "기타",          sub: "직접 입력",       icon: PenLine,         color: "#8892A4" },
];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all ${i < current ? "bg-blue-600" : i === current ? "bg-blue-400" : "bg-border"}`}
          style={{ width: i === current ? 28 : 12 }} />
      ))}
    </div>
  );
}

function OnboardingScreen({ userName, onDone, initialStep = 0 }: { userName: string; onDone: () => void; initialStep?: number }) {
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), 3)); // 0-3
  const [projectType, setProjectType] = useState("");
  const [customType, setCustomType] = useState("");
  const [teamSize, setTeamSize] = useState(4);
  const [leaderName, setLeaderName] = useState(userName || "김민준");
  const [isSelfLeader, setIsSelfLeader] = useState(true);
  const [copied, setCopied] = useState<"member" | "judge" | null>(null);

  const memberUrl = "https://teamflow.ai/invite/gX4mKp";
  const judgeUrl  = "https://teamflow.ai/judge/J8nQrT";

  const handleCopy = (which: "member" | "judge") => {
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  const STEPS = ["프로젝트 목적", "팀원 설정", "팀장 지정", "초대 링크"];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      {/* top logo */}
      <div className="flex items-center gap-2.5 mb-10">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ background: "linear-gradient(135deg, #7048E8, #4F6EF7)" }}>
          TF
        </div>
        <span className="font-bold text-foreground text-base">TeamFlow AI</span>
      </div>

      {/* card */}
      <div className="w-full max-w-xl bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
        {/* card header */}
        <div className="px-8 pt-7 pb-5 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <StepIndicator current={step} total={4} />
            <span className="text-xs font-semibold text-muted-foreground">{step + 1} / 4 단계</span>
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{STEPS[step]}</div>
          <h2 className="text-lg font-bold text-foreground">
            {step === 0 && "어떤 목적으로 사용하시나요?"}
            {step === 1 && "팀원은 몇 명인가요?"}
            {step === 2 && "팀장을 지정해주세요"}
            {step === 3 && "팀을 초대하세요"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {step === 0 && "프로젝트 유형에 따라 AI 기능이 최적화됩니다."}
            {step === 1 && "본인 포함 전체 팀원 수를 선택해주세요."}
            {step === 2 && "팀장은 업무 배정과 팀 코멘트 관리 권한을 갖습니다."}
            {step === 3 && "팀원과 심사자는 서로 다른 접근 권한을 가집니다."}
          </p>
        </div>

        {/* card body */}
        <div className="px-8 py-7">

          {/* ── step 0: project type ── */}
          {step === 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {PROJECT_TYPES.map(t => (
                  <button key={t.id} onClick={() => setProjectType(t.id)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all hover:shadow-sm ${projectType === t.id ? "shadow-sm" : "border-border hover:border-slate-300"}`}
                    style={projectType === t.id ? { borderColor: t.color, background: `${t.color}0A` } : {}}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: projectType === t.id ? `${t.color}20` : "#F4F6FA" }}>
                      <t.icon className="w-4.5 h-4.5" style={{ color: projectType === t.id ? t.color : "#8892A4", width: 18, height: 18 }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{t.label}</div>
                      <div className="text-[11px] text-muted-foreground">{t.sub}</div>
                    </div>
                    {projectType === t.id && (
                      <div className="ml-auto w-5 h-5 rounded-full flex items-center justify-center" style={{ background: t.color }}>
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {projectType === "other" && (
                <div className="mt-1">
                  <input
                    autoFocus
                    value={customType}
                    onChange={e => setCustomType(e.target.value)}
                    placeholder="프로젝트 유형을 직접 입력하세요"
                    className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
              )}
            </div>
          )}

          {/* ── step 1: team size ── */}
          {step === 1 && (
            <div className="flex flex-col items-center gap-8 py-4">
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setTeamSize(v => Math.max(2, v - 1))}
                  className="w-12 h-12 rounded-full border-2 border-border flex items-center justify-center text-xl font-bold text-foreground hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all disabled:opacity-30"
                  disabled={teamSize <= 2}>
                  –
                </button>
                <div className="text-center">
                  <div className="text-5xl font-bold" style={{ color: "var(--primary)" }}>{teamSize}</div>
                  <div className="text-sm text-muted-foreground mt-1">명</div>
                </div>
                <button
                  onClick={() => setTeamSize(v => Math.min(12, v + 1))}
                  className="w-12 h-12 rounded-full border-2 border-border flex items-center justify-center text-xl font-bold text-foreground hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all disabled:opacity-30"
                  disabled={teamSize >= 12}>
                  +
                </button>
              </div>

              {/* size presets */}
              <div className="flex gap-2">
                {[2, 3, 4, 5, 6].map(n => (
                  <button key={n} onClick={() => setTeamSize(n)}
                    className={`w-10 h-10 rounded-lg text-sm font-semibold border transition-all ${teamSize === n ? "border-blue-500 bg-blue-50 text-blue-600" : "border-border bg-muted text-muted-foreground hover:border-slate-300"}`}>
                    {n}
                  </button>
                ))}
              </div>

              {/* visual avatars */}
              <div className="flex flex-wrap justify-center gap-2 max-w-xs">
                {Array.from({ length: teamSize }).map((_, i) => (
                  <div key={i} className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                    style={{ background: ["#3B5BDB", "#7048E8", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"][i % 6] }}>
                    <User className="w-4 h-4" />
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground text-center">본인 포함 총 {teamSize}명 · 나중에 추가/제거 가능합니다</p>
            </div>
          )}

          {/* ── step 2: leader ── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* current user card */}
              <button onClick={() => setIsSelfLeader(true)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${isSelfLeader ? "border-blue-500 bg-blue-50" : "border-border hover:border-slate-300"}`}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base" style={{ background: "#3B5BDB" }}>
                  {(userName || "김")[0]}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-foreground">{userName || "김민준"} <span className="text-[11px] font-normal text-blue-500 ml-1">나</span></div>
                  <div className="text-xs text-muted-foreground">{/* email placeholder */}현재 로그인한 계정</div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelfLeader ? "border-blue-500 bg-blue-500" : "border-border"}`}>
                  {isSelfLeader && <Check className="w-3 h-3 text-white" />}
                </div>
              </button>

              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">또는 다른 팀원을 팀장으로</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <button onClick={() => setIsSelfLeader(false)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${!isSelfLeader ? "border-blue-500 bg-blue-50" : "border-border hover:border-slate-300"}`}>
                <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-foreground">다른 팀원 지정</div>
                  <div className="text-xs text-muted-foreground">팀장 이름 또는 이메일 입력</div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${!isSelfLeader ? "border-blue-500 bg-blue-500" : "border-border"}`}>
                  {!isSelfLeader && <Check className="w-3 h-3 text-white" />}
                </div>
              </button>

              {!isSelfLeader && (
                <input
                  autoFocus
                  value={leaderName}
                  onChange={e => setLeaderName(e.target.value)}
                  placeholder="팀장 이름 또는 이메일"
                  className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              )}

              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">팀장은 업무 배정, 팀 코멘트 작성, 팀원 관리 권한을 갖습니다. 나중에 변경할 수 있습니다.</p>
              </div>
            </div>
          )}

          {/* ── step 3: invite URLs ── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* member invite */}
              <div className="rounded-xl border-2 border-blue-200 p-4 bg-blue-50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#3B5BDB" }}>
                    <Users className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">팀원 초대 링크</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">팀원은 회의록, 업무 보드, 대시보드, 산출물에 접근할 수 있습니다.</p>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-blue-200">
                  <Link className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="flex-1 text-xs font-mono text-foreground truncate">{memberUrl}</span>
                  <button onClick={() => handleCopy("member")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${copied === "member" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600 hover:bg-blue-200"}`}>
                    {copied === "member" ? <><Check className="w-3 h-3" /> 복사됨!</> : <><Copy className="w-3 h-3" /> 복사</>}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {["회의록 열람", "업무 수행", "댓글 작성", "산출물 공동 작업"].map(p => (
                    <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">{p}</span>
                  ))}
                </div>
              </div>

              {/* judge invite */}
              <div className="rounded-xl border-2 border-purple-200 p-4" style={{ background: "rgba(112,72,232,0.04)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#7048E8" }}>
                    <Shield className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">심사자 전용 링크</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(112,72,232,0.15)", color: "#7048E8" }}>교수·조교·심사위원</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">심사자는 개인별 기여도 리포트·AI 평가 근거·최종 점수 관리에 접근할 수 있습니다.</p>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-purple-200">
                  <Link className="w-3.5 h-3.5 shrink-0" style={{ color: "#7048E8" }} />
                  <span className="flex-1 text-xs font-mono text-foreground truncate">{judgeUrl}</span>
                  <button onClick={() => handleCopy("judge")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${copied === "judge" ? "bg-emerald-100 text-emerald-600" : "hover:opacity-80"}`}
                    style={copied !== "judge" ? { background: "rgba(112,72,232,0.12)", color: "#7048E8" } : {}}>
                    {copied === "judge" ? <><Check className="w-3 h-3" /> 복사됨!</> : <><Copy className="w-3 h-3" /> 복사</>}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {["기여도 리포트", "AI 평가 근거", "최종 점수 입력", "평가 데이터 전용"].map(p => (
                    <span key={p} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(112,72,232,0.12)", color: "#7048E8" }}>{p}</span>
                  ))}
                </div>
              </div>

              {/* permission table */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-2.5 bg-muted border-b border-border">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">권한 비교</span>
                </div>
                <div className="divide-y divide-border">
                  {[
                    { feature: "대시보드·업무 보드", member: true, judge: true },
                    { feature: "회의록·AI 요약", member: true, judge: true },
                    { feature: "산출물 생성", member: true, judge: true },
                    { feature: "기여도 리포트", member: false, judge: true },
                    { feature: "AI 평가 근거", member: false, judge: true },
                    { feature: "최종 점수 관리", member: false, judge: true },
                  ].map(r => (
                    <div key={r.feature} className="flex items-center px-4 py-2 text-xs">
                      <span className="flex-1 text-foreground font-medium">{r.feature}</span>
                      <div className="flex gap-8">
                        <span className="w-12 text-center">{r.member ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : <X className="w-3.5 h-3.5 text-muted-foreground mx-auto" />}</span>
                        <span className="w-12 text-center">{r.judge ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : <X className="w-3.5 h-3.5 text-muted-foreground mx-auto" />}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center px-4 py-2 text-xs bg-muted/50">
                    <span className="flex-1 text-muted-foreground" />
                    <div className="flex gap-8 text-[11px] font-semibold">
                      <span className="w-12 text-center text-blue-600">팀원</span>
                      <span className="w-12 text-center" style={{ color: "#7048E8" }}>심사자</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* card footer */}
        <div className="px-8 pb-7 pt-2 flex items-center justify-between">
          <button
            onClick={() => setStep(s => s - 1)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all ${step === 0 ? "invisible" : ""}`}>
            <ArrowLeft className="w-4 h-4" /> 이전
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 0 && !projectType}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #3B5BDB 0%, #4F6EF7 100%)" }}>
              다음 <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onDone}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
              <Sparkles className="w-4 h-4" /> 시작하기
            </button>
          )}
        </div>
      </div>

      {/* skip link */}
      <button onClick={onDone} className="mt-5 text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
        나중에 설정하기
      </button>
    </div>
  );
}

// ─── main app ─────────────────────────────────────────────────────────────────
const TAB_TITLES: Record<Tab, string> = {
  dashboard: "대시보드",
  board: "업무 보드",
  meetings: "회의록 AI",
  deliverables: "산출물 생성",
  github: "GitHub 연동",
  contributors: "기여도 분석",
  mypage: "마이페이지",
};

const APP_TABS: Tab[] = ["dashboard", "board", "meetings", "deliverables", "github", "contributors", "mypage"];
const DETAIL_PAGES: Exclude<DetailPage, null>[] = ["all-tasks", "progress", "blockers", "inprogress", "dash-progress", "urgent", "workload", "activity"];

const initialScreenFromParams = (): Screen => {
  const screen = getDesignParam("screen");
  if (screen === "signup" || screen === "onboarding" || screen === "dashboard") return screen;
  return "login";
};

const initialTabFromParams = (): Tab => {
  const tab = getDesignParam("tab");
  return APP_TABS.includes(tab as Tab) ? (tab as Tab) : "dashboard";
};

const initialDetailFromParams = (): DetailPage => {
  const detail = getDesignParam("detail");
  return DETAIL_PAGES.includes(detail as Exclude<DetailPage, null>) ? (detail as DetailPage) : null;
};

export default function App() {
  const [screen, setScreen] = useState<Screen>(initialScreenFromParams);
  const [signupName, setSignupName] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>(initialTabFromParams);
  const [detailPage, setDetailPage] = useState<DetailPage>(initialDetailFromParams);
  const [aiOpen, setAIOpen] = useState(getDesignParam("ai") === "1");
  const [searchOpen, setSearchOpen] = useState(false);

  const handleTabSelect = (tab: Tab) => { setActiveTab(tab); setDetailPage(null); };

  if (screen === "login") {
    return (
      <LoginScreen
        onLogin={() => setScreen("dashboard")}
        onGoSignup={() => setScreen("signup")}
      />
    );
  }
  if (screen === "signup") {
    return (
      <SignupScreen
        onSignup={() => { setSignupName("김민준"); setScreen("onboarding"); }}
        onGoLogin={() => setScreen("login")}
      />
    );
  }
  if (screen === "onboarding") {
    return (
      <OnboardingScreen
        userName={signupName || "김민준"}
        onDone={() => setScreen("dashboard")}
        initialStep={getDesignStep("onboardingStep")}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <Sidebar active={activeTab} onSelect={handleTabSelect} onAI={() => setAIOpen(true)} />

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6 shrink-0 shadow-sm">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">TeamFlow AI</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">스마트 주차 관리 시스템</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            {detailPage ? (
              <>
                <button onClick={() => setDetailPage(null)} className="text-muted-foreground hover:text-foreground transition-colors">{TAB_TITLES[activeTab]}</button>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-semibold text-foreground">
                  {({
                    "all-tasks": "전체 업무 관리", "progress": "진행률 분석",
                    "blockers": "블로커 관리", "inprogress": "진행 중 업무",
                    "dash-progress": "전체 진행률", "urgent": "마감 임박 업무",
                    "workload": "팀원별 업무량", "activity": "최근 활동",
                  } as Record<string, string>)[detailPage as string]}
                </span>
              </>
            ) : (
              <span className="font-semibold text-foreground">{TAB_TITLES[activeTab]}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <button onClick={() => setSearchOpen(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-sm ${searchOpen ? "bg-secondary border-blue-300" : "border-border bg-muted hover:bg-secondary"}`}>
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              {!searchOpen && <span className="text-muted-foreground text-xs">검색...</span>}
              {searchOpen && <input autoFocus className="bg-transparent outline-none text-xs text-foreground w-32 placeholder-muted-foreground" placeholder="업무, 회의록, 파일 검색" />}
            </button>

            {/* Deadline badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
              <Calendar className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-medium text-amber-600">D-18 최종 제출</span>
            </div>

            <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
            </button>

            {/* Team avatars */}
            <div className="flex -space-x-2 ml-1">
              {MEMBERS.map(m => (
                <div key={m.id} title={m.name} className="w-8 h-8 rounded-full border-2 border-card flex items-center justify-center text-white text-xs font-semibold" style={{ background: m.color }}>
                  {m.initials}
                </div>
              ))}
            </div>

            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium transition-opacity hover:opacity-90"
              style={{ background: "var(--primary)" }}>
              <Plus className="w-3.5 h-3.5" /> 업무 추가
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-hidden">
          {activeTab === "dashboard" && !detailPage && <DashboardView onCardClick={setDetailPage} />}
          {activeTab === "dashboard" && detailPage === "all-tasks"     && <AllTasksPage    onBack={() => setDetailPage(null)} />}
          {activeTab === "dashboard" && detailPage === "progress"      && <ProgressPage    onBack={() => setDetailPage(null)} />}
          {activeTab === "dashboard" && detailPage === "blockers"      && <BlockersPage    onBack={() => setDetailPage(null)} />}
          {activeTab === "dashboard" && detailPage === "inprogress"    && <InProgressPage  onBack={() => setDetailPage(null)} />}
          {activeTab === "dashboard" && detailPage === "dash-progress" && <DashProgressPage onBack={() => setDetailPage(null)} onGoUrgent={() => setDetailPage("urgent")} />}
          {activeTab === "dashboard" && detailPage === "urgent"        && <UrgentTasksPage onBack={() => setDetailPage(null)} />}
          {activeTab === "dashboard" && detailPage === "workload"      && <WorkloadPage    onBack={() => setDetailPage(null)} />}
          {activeTab === "dashboard" && detailPage === "activity"      && <ActivityPage    onBack={() => setDetailPage(null)} />}
          {activeTab === "board" && <BoardView />}
          {activeTab === "meetings" && <MeetingsView onGoBoard={() => handleTabSelect("board")} />}
          {activeTab === "deliverables" && <DeliverablesView />}
          {activeTab === "github" && <GithubView />}
          {activeTab === "contributors" && <ContributorsView />}
          {activeTab === "mypage" && <MyPage />}
        </main>
      </div>

      {/* AI floating button */}
      {!aiOpen && (
        <button onClick={() => setAIOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center text-white transition-transform hover:scale-105 z-40"
          style={{ background: "linear-gradient(135deg, #7048E8 0%, #4F6EF7 100%)" }}>
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {/* AI panel overlay */}
      {aiOpen && (
        <>
          <div className="fixed inset-0 bg-black/10 z-40" onClick={() => setAIOpen(false)} />
          <AIAssistant onClose={() => setAIOpen(false)} />
        </>
      )}
    </div>
  );
}
