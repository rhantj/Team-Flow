import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, ClipboardCheck, Crown, GraduationCap, KeyRound, Link2, Plus, ShieldCheck, UserRound } from "lucide-react";
import { AuthBrandPanel } from "../components/AuthBrandPanel";
import { useAuth, type AppRole } from "../../global/hooks/useAuth";
import { REVIEWER_ACTIVITIES, REVIEWER_TEAMS } from "../../board/libs/mock/reviewer";

const PROJECTS: Array<{ id: string; name: string; type: string; role: AppRole; deadline: string; progress: number }> = [
  { id: "p1", name: "스마트 주차 관리 시스템", type: "캡스톤디자인", role: "LEADER", deadline: "D-18", progress: 71 },
  { id: "p2", name: "AI 식단 추천 앱", type: "팀프로젝트", role: "MEMBER", deadline: "D-24", progress: 48 },
];

const ROLE_META: Record<AppRole, { label: string; color: string; bg: string; icon: typeof Crown }> = {
  ADMIN: { label: "관리자", color: "#0F172A", bg: "rgba(15,23,42,0.08)", icon: KeyRound },
  LEADER: { label: "팀장", color: "#3B5BDB", bg: "rgba(59,91,219,0.1)", icon: Crown },
  MEMBER: { label: "팀원", color: "#10B981", bg: "rgba(16,185,129,0.1)", icon: UserRound },
  JUDGE: { label: "심사자", color: "#7048E8", bg: "rgba(112,72,232,0.1)", icon: KeyRound },
};

type JudgeProject = (typeof REVIEWER_TEAMS)[number];
type EvalStatus = JudgeProject["evalStatus"];

const JUDGE_STATUS_META: Record<EvalStatus, { label: string; color: string; bg: string; border: string }> = {
  pending: { label: "평가 전", color: "#64748B", bg: "#F8FAFC", border: "#CBD5E1" },
  evaluating: { label: "평가 중", color: "#D97706", bg: "#FFFBEB", border: "#FCD34D" },
  published: { label: "공개 완료", color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
};

export function ProjectEntryScreen() {
  const navigate = useNavigate();
  const { signupName, appRole, currentProjectRole, setProjectContext } = useAuth();
  const [inviteCode, setInviteCode] = useState("");
  const [projectName, setProjectName] = useState("새 캡스톤 프로젝트");
  const [message, setMessage] = useState<string | null>(null);
  const [judgeProjects, setJudgeProjects] = useState<JudgeProject[]>([...REVIEWER_TEAMS]);
  const [judgeProjectCode, setJudgeProjectCode] = useState("");
  const [judgeMessage, setJudgeMessage] = useState<string | null>(null);
  const isJudgeHome = appRole === "JUDGE" || currentProjectRole === "JUDGE";

  const enterProject = (role: AppRole, name: string) => {
    setProjectContext(role, name);
    navigate("/dashboard");
  };

  const handleCreateProject = () => {
    const name = projectName.trim() || "새 캡스톤 프로젝트";
    enterProject("LEADER", name);
  };

  const handleJoinByCode = () => {
    const code = inviteCode.trim();
    if (!code) {
      setMessage("초대 URL 또는 코드를 입력해주세요.");
      return;
    }
    const name = code.includes("parking") || code.includes("gX4mKp")
      ? "스마트 주차 관리 시스템"
      : "초대받은 팀 프로젝트";
    enterProject("MEMBER", name);
  };

  const enterJudgeProject = (project: JudgeProject) => {
    setProjectContext("JUDGE", project.name);
    navigate(`/contributors?team=${project.id}`);
  };

  const handleAddJudgeProject = () => {
    const value = judgeProjectCode.trim();
    if (!value) {
      setJudgeMessage("프로젝트 URL, 코드 또는 프로젝트명을 입력해주세요.");
      return;
    }

    const newProject: JudgeProject = {
      id: `J-${Date.now()}`,
      name: value.includes("http") || value.length <= 12 ? "신규 심사 배정 프로젝트" : value,
      leader: "미정",
      members: 0,
      progress: 0,
      evalStatus: "pending",
      deliverables: 0,
      github: false,
      submitted: 0,
      type: "캡스톤",
    };
    setJudgeProjects(prev => [newProject, ...prev]);
    setProjectContext("JUDGE", newProject.name);
    setJudgeMessage("심사 프로젝트가 추가되었습니다. 목록에서 선택하면 기여도 분석으로 이동합니다.");
    setJudgeProjectCode("");
  };

  if (isJudgeHome) {
    const evaluatingCount = judgeProjects.filter(project => project.evalStatus === "evaluating").length;
    const publishedCount = judgeProjects.filter(project => project.evalStatus === "published").length;

    return (
      <div className="flex min-h-screen flex-col lg:flex-row" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
        <AuthBrandPanel />

        <div className="flex-1 bg-background px-4 py-6 sm:px-6 lg:px-8 lg:py-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-100 px-2.5 py-1 rounded-lg mb-3">
                  <GraduationCap className="w-3.5 h-3.5" />
                  심사자 홈
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-1">
                  {signupName || "박교수"}님, 심사할 프로젝트를 선택하세요
                </h1>
                <p className="text-sm text-muted-foreground">
                  배정된 프로젝트를 누르면 해당 팀의 기여도 분석 상세 화면으로 이동합니다.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:w-[430px]">
                {[
                  { label: "배정", value: judgeProjects.length, color: "#7048E8" },
                  { label: "평가 중", value: evaluatingCount, color: "#D97706" },
                  { label: "공개 완료", value: publishedCount, color: "#059669" },
                ].map(item => (
                  <div key={item.label} className="bg-card border border-border rounded-xl px-3 py-2.5 shadow-sm">
                    <div className="text-[11px] text-muted-foreground">{item.label}</div>
                    <div className="text-xl font-bold mt-0.5" style={{ color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
              <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <div className="text-sm font-bold text-foreground">배정된 프로젝트</div>
                  <div className="text-xs text-muted-foreground mt-1">담당 팀을 선택해 기여도를 검토합니다.</div>
                </div>

                <div className="divide-y divide-border">
                  {judgeProjects.map(project => {
                    const meta = JUDGE_STATUS_META[project.evalStatus];
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => enterJudgeProject(project)}
                        className="w-full text-left px-5 py-5 hover:bg-blue-50 transition-colors"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <h2 className="text-lg font-bold text-foreground leading-snug">{project.name}</h2>
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold"
                                style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
                              >
                                {meta.label}
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {project.leader} 팀장 · {project.members}명 · 산출물 {project.submitted}/{project.deliverables}개
                            </div>
                          </div>
                          <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0 hidden sm:block" />
                        </div>

                        <div className="mt-4">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-muted-foreground">프로젝트 진행률</span>
                            <span className="font-bold text-foreground">{project.progress}%</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-blue-600" style={{ width: `${project.progress}%` }} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <aside className="space-y-4">
                <section className="bg-card border border-border rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-white">
                      <Plus className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-foreground">심사 프로젝트 추가</h2>
                      <p className="text-xs text-muted-foreground">배정 코드, URL, 프로젝트명으로 추가합니다.</p>
                    </div>
                  </div>
                  <input
                    value={judgeProjectCode}
                    onChange={event => { setJudgeProjectCode(event.target.value); setJudgeMessage(null); }}
                    placeholder="예: review-T5 또는 프로젝트 초대 URL"
                    className="w-full rounded-xl border border-border bg-input-background px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                  {judgeMessage && <div className="mt-2 text-xs text-violet-600 leading-relaxed">{judgeMessage}</div>}
                  <button
                    type="button"
                    onClick={handleAddJudgeProject}
                    className="mt-3 w-full py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    프로젝트 추가
                  </button>
                </section>

                <section className="bg-card border border-border rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <ClipboardCheck className="w-4 h-4 text-blue-600" />
                    <h2 className="text-sm font-bold text-foreground">최근 심사 활동</h2>
                  </div>
                  <div className="space-y-3">
                    {REVIEWER_ACTIVITIES.map((activity, index) => (
                      <div key={`${activity.team}-${index}`} className="border-b border-border last:border-0 pb-3 last:pb-0">
                        <div className="text-xs font-semibold text-foreground">{activity.action}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{activity.team} · {activity.date}</div>
                      </div>
                    ))}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <AuthBrandPanel />

      <div className="flex-1 bg-background px-4 py-6 sm:px-6 lg:px-8 lg:py-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <div className="mb-7">
            <div>
              <div className="text-xs font-semibold text-blue-600 mb-2">프로젝트 진입</div>
              <h1 className="text-2xl font-bold text-foreground mb-1">
                {signupName || "사용자"}님, 참여할 프로젝트를 선택하세요
              </h1>
              <p className="text-sm text-muted-foreground">
                프로젝트를 직접 만들면 팀장으로, 초대 코드로 참여하면 팀원으로 연결됩니다.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-5">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">내 프로젝트 목록</h2>
                <span className="text-xs text-muted-foreground">권한이 함께 표시됩니다.</span>
              </div>

              {PROJECTS.map(project => {
                const role = ROLE_META[project.role];
                const RoleIcon = role.icon;
                return (
                  <button
                    key={project.id}
                    onClick={() => enterProject(project.role, project.name)}
                    className="w-full text-left bg-card border border-border rounded-xl p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-bold text-foreground truncate">{project.name}</h3>
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold shrink-0"
                            style={{ color: role.color, background: role.bg }}>
                            <RoleIcon className="w-3 h-3" />
                            {role.label}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">{project.type} · {project.deadline} 최종 제출</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                    <div className="mt-4">
                      <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                        <span>진행률</span>
                        <span>{project.progress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${project.progress}%`, background: "linear-gradient(135deg, #3B5BDB 0%, #4F6EF7 100%)" }} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </section>

            <section className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ background: "#3B5BDB" }}>
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">새 프로젝트 생성</h2>
                    <p className="text-xs text-muted-foreground">생성 즉시 팀장 권한으로 시작합니다.</p>
                  </div>
                </div>
                <input
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-input-background px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  placeholder="프로젝트명을 입력하세요"
                />
                <button onClick={handleCreateProject}
                  className="mt-3 w-full py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                  style={{ background: "linear-gradient(135deg, #3B5BDB 0%, #4F6EF7 100%)" }}>
                  <Crown className="w-4 h-4" />
                  팀장으로 프로젝트 시작
                </button>
              </div>

              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ background: "#10B981" }}>
                    <Link2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">초대 URL 또는 코드 입력</h2>
                    <p className="text-xs text-muted-foreground">참여하면 팀원 권한으로 연결됩니다.</p>
                  </div>
                </div>
                <input
                  value={inviteCode}
                  onChange={e => { setInviteCode(e.target.value); setMessage(null); }}
                  className="w-full rounded-xl border border-border bg-input-background px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  placeholder="예: https://teamflow.ai/invite/gX4mKp 또는 gX4mKp"
                />
                {message && <div className="mt-2 text-xs text-red-500">{message}</div>}
                <button onClick={handleJoinByCode}
                  className="mt-3 w-full py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                  style={{ background: "#10B981" }}>
                  <UserRound className="w-4 h-4" />
                  팀원으로 참여
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
