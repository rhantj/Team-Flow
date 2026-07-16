import { useState } from "react";
import { useNavigate } from "react-router";
import { Check, ChevronDown, Hash, Plus, Sparkles, Settings, Shield } from "lucide-react";
import { NAV_ITEMS } from "../../lib/constants/nav";
import type { Tab } from "../../../board/libs/types/task";
import { useAuth } from "../../hooks/useAuth";
import type { ProjectRoleKo } from "../../api/authTypes";

const ROLE_COLORS: Record<ProjectRoleKo, string> = {
  "팀장": "#3B5BDB",
  "팀원": "#10B981",
  "심사자": "#7048E8",
};

export function Sidebar({ active, onSelect, onAI }: { active: Tab; onSelect: (t: Tab) => void; onAI: () => void }) {
  const groups: Record<string, string> = { planning: "계획 관리", ai: "AI 기능", dev: "개발", eval: "평가 (심사자 전용)", me: "내 계정" };
  const rendered: string[] = [];
  const navigate = useNavigate();
  const { user, projectRoles, currentProjectId, currentProject, selectProject } = useAuth();
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const currentProjectName = currentProject?.projectTitle ?? null;
  const role: ProjectRoleKo = currentProject?.role ?? "팀장";
  const navItems = NAV_ITEMS;

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
      <div className="relative mx-3 mb-4">
        <button
          onClick={() => setProjectMenuOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors"
          style={{ background: "var(--sidebar-accent)" }}
        >
          <div className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center shrink-0">
            <Hash className="w-3 h-3 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">{currentProjectName || "스마트 주차 관리"}</div>
            <div className="text-[10px] flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
              <span>캡스톤디자인 2024</span>
              <span className="px-1.5 py-0.5 rounded font-semibold" style={{ color: "#fff", background: ROLE_COLORS[role] }}>
                {role}
              </span>
            </div>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-transform ${projectMenuOpen ? "rotate-180" : ""}`}
            style={{ color: "var(--muted-foreground)" }}
          />
        </button>

        {projectMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setProjectMenuOpen(false)} />
            <div
              className="absolute left-0 top-full mt-1.5 w-full rounded-lg border shadow-lg z-50 overflow-hidden"
              style={{ background: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}
            >
              <div className="max-h-64 overflow-y-auto py-1">
                {projectRoles.length === 0 ? (
                  <div className="px-3 py-3 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                    생성된 프로젝트가 없습니다.
                  </div>
                ) : (
                  projectRoles.map((pr) => {
                    const isSelected = pr.projectId === currentProjectId;
                    return (
                      <button
                        key={pr.projectId}
                        onClick={() => { selectProject(pr.projectId); setProjectMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/5"
                        style={{ background: isSelected ? "var(--sidebar-accent)" : "transparent" }}
                      >
                        <span className="flex-1 min-w-0 text-xs font-medium text-white truncate">
                          {pr.projectTitle || "제목 없음"}
                        </span>
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                          style={{ color: "#fff", background: ROLE_COLORS[pr.role] }}
                        >
                          {pr.role}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--accent)" }} />}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="border-t" style={{ borderColor: "var(--sidebar-border)" }}>
                <button
                  onClick={() => { setProjectMenuOpen(false); navigate("/onboarding"); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/5"
                  style={{ color: "var(--accent)" }}
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-medium">새 프로젝트 만들기</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
        {navItems.map((item) => {
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
        {role !== "심사자" && <div className="pt-4">
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
        </div>}
      </nav>

      {/* User */}
      <div className="p-3 mt-2 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{ background: "#3B5BDB" }}>
            김
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white">{user?.name || "사용자"}</div>
            <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{role}</div>
          </div>
          <Settings className="w-4 h-4 cursor-pointer" style={{ color: "var(--muted-foreground)" }} />
        </div>
      </div>
    </div>
  );
}
