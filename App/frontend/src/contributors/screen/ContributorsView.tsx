import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  EyeOff,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  CONTRIB_REPORTS,
  REVIEWER_TEAMS,
} from "../../global/lib/mock/reviewer";
import { fetchAttendanceSummary, type MeetingAttendanceSummaryDto } from "../../meetings/libs/utils/meetingAiApi";
import { fetchContributionReport, fetchContributionScore, type MemberContributionDto, type ContributionMemberScoreDto } from "../libs/utils/contributorsApi";
import { useAuth } from "../../global/hooks/useAuth";

type Team = (typeof REVIEWER_TEAMS)[number];
type EvalStatus = Team["evalStatus"];
type CategoryKey = "workload" | "task" | "meeting";

const STATUS_META: Record<EvalStatus, { label: string; color: string; bg: string; border: string }> = {
  pending: { label: "평가 전", color: "#64748B", bg: "#F1F5F9", border: "#CBD5E1" },
  evaluating: { label: "평가 중", color: "#D97706", bg: "#FFFBEB", border: "#FCD34D" },
  published: { label: "공개 완료", color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
};

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  workload: "업무 편중도",
  task: "업무 수행",
  meeting: "회의 참여",
};

function scoreTone(score: number) {
  if (score >= 90) return { label: "우수", color: "#2563EB", bg: "#EFF6FF" };
  if (score >= 80) return { label: "양호", color: "#059669", bg: "#ECFDF5" };
  if (score >= 70) return { label: "주의", color: "#D97706", bg: "#FFFBEB" };
  return { label: "검토 필요", color: "#DC2626", bg: "#FEF2F2" };
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export function ContributorsView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentProjectId } = useAuth();
  const [selectedMemberId, setSelectedMemberId] = useState(CONTRIB_REPORTS[0]?.memberId ?? "");
  const [query, setQuery] = useState("");
  // 실제 회의 참석 데이터로 목업 회의 참여 지표를 보강한다. 실패하면 목업 값을 그대로 쓴다.
  const [attendanceSummaries, setAttendanceSummaries] = useState<MeetingAttendanceSummaryDto[]>([]);
  useEffect(() => {
    if (currentProjectId == null) {
      setAttendanceSummaries([]);
      return;
    }
    fetchAttendanceSummary(String(currentProjectId)).then(setAttendanceSummaries).catch(() => setAttendanceSummaries([]));
  }, [currentProjectId]);
  const attendanceByMemberId = useMemo(
    () => Object.fromEntries(attendanceSummaries.map((summary) => [String(summary.userId), summary])),
    [attendanceSummaries],
  );
  // 실제 기여 점수로 목업 score/categories를 보강한다. 실패하면 목업 값을 그대로 쓴다.
  const [contributionScores, setContributionScores] = useState<ContributionMemberScoreDto[]>([]);
  useEffect(() => {
    if (currentProjectId == null) {
      setContributionScores([]);
      return;
    }
    fetchContributionScore(currentProjectId)
      .then((result) => setContributionScores(result.members))
      .catch(() => setContributionScores([]));
  }, [currentProjectId]);
  const contributionByMemberId = useMemo(
    () => Object.fromEntries(contributionScores.map((s) => [s.assigneeId, s])),
    [contributionScores],
  );
  const [publicFlags, setPublicFlags] = useState<Record<string, boolean>>(
    Object.fromEntries(CONTRIB_REPORTS.map((report) => [report.memberId, report.isPublic])) as Record<string, boolean>,
  );
  const [memo, setMemo] = useState("");
  const [reportOverrides, setReportOverrides] = useState<Record<string, { summary: string; evidence: string[] }>>({});
  const [isRefreshingReport, setIsRefreshingReport] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const mergedReports = useMemo(
    () =>
      CONTRIB_REPORTS.map((report) => {
        const override = reportOverrides[report.memberId];
        const scoreData = contributionByMemberId[report.memberId];
        return {
          ...report,
          aiSummary: override?.summary ?? report.aiSummary,
          evidence: override?.evidence ?? report.evidence,
          score: scoreData ? Math.round(scoreData.contributionScore) : report.score,
          categories: scoreData
            ? { task: scoreData.taskComponent, meeting: scoreData.meetingComponent, workload: scoreData.workloadComponent }
            : report.categories,
        };
      }),
    [reportOverrides, contributionByMemberId],
  );

  const handleRefreshReport = async () => {
    if (currentProjectId == null) return;
    setIsRefreshingReport(true);
    setRefreshError(null);
    try {
      const reports = await fetchContributionReport(currentProjectId);
      setReportOverrides(
        Object.fromEntries(
          reports.map((report: MemberContributionDto) => [
            String(report.userId),
            { summary: report.summary, evidence: report.evidence },
          ]),
        ),
      );
    } catch {
      setRefreshError("기여도 리포트를 새로고침하지 못했습니다.");
    } finally {
      setIsRefreshingReport(false);
    }
  };

  const requestedTeamId = useMemo(() => new URLSearchParams(location.search).get("team"), [location.search]);
  const selectedTeam = REVIEWER_TEAMS.find((team) => team.id === requestedTeamId) ?? REVIEWER_TEAMS[0];
  const filteredReports = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return mergedReports;
    return mergedReports.filter((report) => {
      const haystack = [
        report.name,
        report.role,
        report.aiSummary,
        ...report.evidence,
      ].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [query, mergedReports]);

  const selectedMember = mergedReports.find((report) => report.memberId === selectedMemberId) ?? mergedReports[0];
  const averageScore = Math.round(mergedReports.reduce((sum, report) => sum + report.score, 0) / mergedReports.length);
  const publishedCount = Object.values(publicFlags).filter(Boolean).length;
  const evidenceCount = mergedReports.reduce((sum, report) => sum + report.evidence.length, 0);
  const completedTasks = mergedReports.reduce((sum, report) => sum + report.todoDone, 0);
  const totalTasks = mergedReports.reduce((sum, report) => sum + report.todoTotal, 0);
  const statusMeta = STATUS_META[selectedTeam.evalStatus];
  const selectedTone = scoreTone(selectedMember.score);

  return (
    <div
      className="h-full overflow-y-auto bg-background"
      style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}
    >
      <div className="w-full max-w-[1480px] mx-auto p-4 sm:p-5 lg:p-6 space-y-5">
        <section className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <button
              type="button"
              onClick={() => navigate("/projects")}
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              프로젝트 목록으로
            </button>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-600">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground leading-tight">기여도 분석</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  업무, 회의록, 산출물 데이터를 기반으로 개인별 기여도를 검토합니다.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="px-2 py-1 rounded-md bg-muted text-foreground font-semibold">심사자 전용</span>
              <span>팀원에게는 공개 처리된 최종 점수와 코멘트만 노출됩니다.</span>
            </div>
            {refreshError && (
              <p className="mt-2 text-xs font-semibold text-red-600">{refreshError}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRefreshReport}
              disabled={isRefreshingReport || currentProjectId == null}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingReport ? "animate-spin" : ""}`} />
              {isRefreshingReport ? "새로고침 중..." : "리포트 새로고침"}
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-xs font-semibold text-foreground hover:bg-muted transition-colors">
              <Download className="w-3.5 h-3.5" />
              PDF 저장
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" />
              평가 확정
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { label: "팀 평균 점수", value: `${averageScore}점`, icon: Award, color: "#2563EB" },
            { label: "평가 대상", value: `${mergedReports.length}명`, icon: Users, color: "#7C3AED" },
            { label: "공개 완료", value: `${publishedCount}/${mergedReports.length}`, icon: Eye, color: "#059669" },
            { label: "근거 항목", value: `${evidenceCount}개`, icon: ClipboardCheck, color: "#D97706" },
          ].map((item) => (
            <div key={item.label} className="bg-card border border-border rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-muted-foreground">{item.label}</div>
                  <div className="text-2xl font-bold text-foreground mt-1">{item.value}</div>
                </div>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${item.color}14` }}>
                  <item.icon className="w-4 h-4" style={{ color: item.color }} />
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
          <main className="space-y-4 min-w-0">
            <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-4 border-b border-border flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-foreground">{selectedTeam.name}</h2>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                      style={{ color: statusMeta.color, background: statusMeta.bg, borderColor: statusMeta.border }}
                    >
                      {statusMeta.label}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    GitHub {selectedTeam.github ? "연결됨" : "미연결"} · 산출물 {selectedTeam.submitted}/{selectedTeam.deliverables}개 제출 · 전체 업무 완료율 {percent(completedTasks, totalTasks)}%
                  </div>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="이름, 역할, 근거 검색"
                    className="w-full rounded-lg border border-border bg-input-background pl-9 pr-3 py-2 text-xs outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[76px_1fr_98px_90px_90px_84px_86px] px-5 py-2.5 bg-muted/40 border-b border-border text-[11px] font-bold text-muted-foreground">
                    <div className="text-center">순위</div>
                    <div>이름/역할</div>
                    <div className="text-center">기여 점수</div>
                    <div className="text-center">업무 수행</div>
                    <div className="text-center">회의 참여</div>
                    <div className="text-center">업무 편중도</div>
                    <div className="text-center">공개</div>
                  </div>

                  <div className="divide-y divide-border">
                    {filteredReports.map((report, index) => {
                      const isSelected = selectedMember.memberId === report.memberId;
                      const tone = scoreTone(report.score);
                      const taskRate = percent(report.todoDone, report.todoTotal);
                      return (
                        <button
                          key={report.memberId}
                          type="button"
                          onClick={() => setSelectedMemberId(report.memberId)}
                          className={`grid grid-cols-[76px_1fr_98px_90px_90px_84px_86px] w-full items-center px-5 py-3 text-left transition-colors ${
                            isSelected ? "bg-blue-50" : "hover:bg-muted/40"
                          }`}
                        >
                      <div className="flex items-center justify-center gap-2">
                        <span className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-foreground bg-muted">
                          {index + 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                          style={{ background: report.color }}
                        >
                          {report.name[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-foreground truncate">{report.name}</div>
                          <div className="text-[11px] text-muted-foreground">{report.role}</div>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold" style={{ color: tone.color }}>{report.score}</div>
                        <div className="text-[10px] font-semibold" style={{ color: tone.color }}>{tone.label}</div>
                      </div>
                      <div className="text-xs text-foreground text-center">
                        <span className="font-bold">{report.todoDone}</span>
                        <span className="text-muted-foreground">/{report.todoTotal}</span>
                        <div className="text-[10px] text-muted-foreground">{taskRate}%</div>
                      </div>
                      <div className="text-xs text-foreground text-center">
                        {attendanceByMemberId[report.memberId] ? (
                          <>
                            <span className="font-bold">{attendanceByMemberId[report.memberId].meetingsAttended}</span>
                            <span className="text-muted-foreground">/{attendanceByMemberId[report.memberId].totalMeetings}회</span>
                            <div className="text-[10px] text-muted-foreground">{attendanceByMemberId[report.memberId].attendanceRate}%</div>
                          </>
                        ) : (
                          <span className="font-bold">{report.meetings}회</span>
                        )}
                      </div>
                      <div className="text-xs text-foreground text-center">
                        <span className="font-bold">{report.categories.workload}</span>
                      </div>
                      <div className="text-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${
                          publicFlags[report.memberId]
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}>
                          {publicFlags[report.memberId] ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {publicFlags[report.memberId] ? "공개" : "비공개"}
                        </span>
                      </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="bg-card border border-border rounded-lg p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <h3 className="text-sm font-bold text-foreground">AI 분석 요약</h3>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{selectedMember.aiSummary}</p>
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    AI 분석은 평가 보조 자료입니다. 최종 점수와 공개 여부는 심사자가 확정해야 합니다.
                  </p>
                </div>
              </section>

              <section className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-bold shrink-0"
                        style={{ background: selectedMember.color }}
                      >
                        {selectedMember.name[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="text-base font-bold text-foreground truncate">{selectedMember.name}</div>
                        <div className="text-xs text-muted-foreground">{selectedMember.role}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-3xl font-bold" style={{ color: selectedTone.color }}>{selectedMember.score}</div>
                      <div
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ color: selectedTone.color, background: selectedTone.bg }}
                      >
                        {selectedTone.label}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {Object.entries(selectedMember.categories).map(([key, value]) => (
                    <div key={key}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{CATEGORY_LABELS[key as CategoryKey]}</span>
                        <span className="font-bold text-foreground">{value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${value}%`, background: selectedMember.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </main>

          <aside className="space-y-4 min-w-0">
            <section className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-bold shrink-0"
                      style={{ background: selectedMember.color }}
                    >
                      {selectedMember.name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-base font-bold text-foreground truncate">{selectedMember.name}</div>
                      <div className="text-xs text-muted-foreground">{selectedMember.role}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-3xl font-bold" style={{ color: selectedTone.color }}>{selectedMember.score}</div>
                    <div
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ color: selectedTone.color, background: selectedTone.bg }}
                    >
                      {selectedTone.label}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {Object.entries(selectedMember.categories).map(([key, value]) => (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{CATEGORY_LABELS[key as CategoryKey]}</span>
                      <span className="font-bold text-foreground">{value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${value}%`, background: selectedMember.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-card border border-border rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-foreground">분석 근거</h3>
                </div>
                <span className="text-[10px] text-muted-foreground">{selectedMember.evidence.length}개</span>
              </div>
              <div className="space-y-2">
                {selectedMember.evidence.map((evidence, index) => (
                  <button
                    key={evidence}
                    type="button"
                    className="w-full flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <span className="w-5 h-5 rounded-md bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                      {index + 1}
                    </span>
                    <span className="text-xs font-medium text-foreground">{evidence}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="bg-card border border-border rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-foreground">심사 코멘트</h3>
              </div>
              <textarea
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                rows={4}
                placeholder={`${selectedMember.name}에게 남길 평가 코멘트를 입력하세요.`}
                className="w-full resize-none rounded-lg border border-border bg-input-background px-3 py-2 text-xs outline-none focus:border-blue-400"
              />
              <div className="flex items-center justify-between gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setPublicFlags((prev) => ({
                      ...prev,
                      [selectedMember.memberId]: !prev[selectedMember.memberId],
                    }));
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  {publicFlags[selectedMember.memberId] ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {publicFlags[selectedMember.memberId] ? "공개 중" : "비공개"}
                </button>
                <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors">
                  <BarChart3 className="w-3.5 h-3.5" />
                  저장
                </button>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}

// ─── AI assistant panel ───────────────────────────────────────────────────────
