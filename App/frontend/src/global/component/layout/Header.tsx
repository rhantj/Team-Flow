import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ChevronRight, Search, Calendar, Bell, LogOut } from "lucide-react";
import { MEMBERS } from "../../lib/mock/members";
import { TAB_TITLES } from "../../lib/constants/nav";
import type { Tab } from "../../../board/libs/types/task";
import { useStoredNotifications, markNotificationsRead } from "../../../board/libs/utils/activityStore";
import { useAuth, type AppRole } from "../../hooks/useAuth";

const CURRENT_USER = MEMBERS[0];

const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: "관리자",
  LEADER: "팀장",
  MEMBER: "팀원",
  JUDGE: "심사자",
};

const ROLE_COLORS: Record<AppRole, string> = {
  ADMIN: "#0F172A",
  LEADER: "#3B5BDB",
  MEMBER: "#10B981",
  JUDGE: "#7048E8",
};

const DETAIL_TITLES: Record<string, string> = {
  "all-tasks": "전체 업무 관리", "progress": "진행률 분석",
  "blockers": "블로커 관리", "inprogress": "진행 중 업무",
  "dash-progress": "전체 진행률", "urgent": "마감 임박 업무",
  "workload": "팀원별 업무량", "activity": "최근 활동",
};

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { currentProjectName, currentProjectRole, logout } = useAuth();
  const role = currentProjectRole ?? "LEADER";
  const allNotifications = useStoredNotifications();
  const myNotifications = allNotifications.filter(n => n.recipientId === CURRENT_USER.id);
  const unreadCount = myNotifications.filter(n => !n.read).length;

  const segments = location.pathname.split("/").filter(Boolean);
  const activeTab = (segments[0] ?? "dashboard") as Tab;
  const detailPage = segments[1] ?? null;
  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6 shrink-0 shadow-sm">
      <div className="flex items-center gap-2 text-sm min-w-0">
        <span className="text-muted-foreground">TeamFlow AI</span>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-muted-foreground truncate max-w-[220px]">{currentProjectName || "스마트 주차 관리 시스템"}</span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: ROLE_COLORS[role] }}>
          {ROLE_LABELS[role]}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        {detailPage ? (
          <>
            <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground transition-colors">{TAB_TITLES[activeTab]}</button>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-semibold text-foreground">{DETAIL_TITLES[detailPage]}</span>
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

        <div className="relative">
          <button
            onClick={() => { setNotifOpen(v => !v); if (!notifOpen) markNotificationsRead(); }}
            className={`relative h-10 min-w-10 px-2.5 rounded-xl border shadow-sm transition-all flex items-center justify-center ${
              notifOpen
                ? "border-blue-400 bg-blue-100 text-blue-700"
                : "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300"
            }`}
            aria-label="알림"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-card">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border text-xs font-semibold text-foreground">알림</div>
                <div className="max-h-80 overflow-y-auto">
                  {myNotifications.length === 0 ? (
                    <div className="px-4 py-6 text-xs text-muted-foreground text-center">알림이 없습니다.</div>
                  ) : myNotifications.map(n => (
                    <div key={n.id} className="px-4 py-2.5 border-b border-border last:border-0 text-xs text-foreground">
                      {n.message}
                      <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(n.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Team avatars */}
        <div className="flex -space-x-2 ml-1">
          {MEMBERS.map(m => (
            <div key={m.id} title={m.name} className="w-8 h-8 rounded-full border-2 border-card flex items-center justify-center text-white text-xs font-semibold" style={{ background: m.color }}>
              {m.initials}
            </div>
          ))}
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-card text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </button>
      </div>
    </header>
  );
}
