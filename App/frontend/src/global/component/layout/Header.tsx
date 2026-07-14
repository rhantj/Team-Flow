import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ChevronRight, Search, Calendar, Bell, Plus } from "lucide-react";
import { MEMBERS } from "../../lib/mock/members";
import { TAB_TITLES } from "../../lib/constants/nav";
import type { Tab } from "../../../board/libs/types/task";
import { useStoredNotifications, markNotificationsRead } from "../../../board/libs/utils/activityStore";

const CURRENT_USER = MEMBERS[0];

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
  const allNotifications = useStoredNotifications();
  const myNotifications = allNotifications.filter(n => n.recipientId === CURRENT_USER.id);
  const unreadCount = myNotifications.filter(n => !n.read).length;

  const segments = location.pathname.split("/").filter(Boolean);
  const activeTab = (segments[0] ?? "dashboard") as Tab;
  const detailPage = segments[1] ?? null;

  return (
    <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6 shrink-0 shadow-sm">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">TeamFlow AI</span>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">스마트 주차 관리 시스템</span>
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
          <button onClick={() => { setNotifOpen(v => !v); if (!notifOpen) markNotificationsRead(); }} className="relative p-2 rounded-lg hover:bg-muted transition-colors">
            <Bell className="w-4 h-4 text-muted-foreground" />
            {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />}
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

        <button onClick={() => navigate("/board?openAdd=1")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--primary)" }}>
          <Plus className="w-3.5 h-3.5" /> 업무 추가
        </button>
      </div>
    </header>
  );
}
