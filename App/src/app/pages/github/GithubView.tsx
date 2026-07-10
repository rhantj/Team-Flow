import { GITHUB } from "../../data/github";
import {
  Github,
  Sparkles,
  GitCommit,
  GitPullRequest,
  Zap,
  GitMerge,
  Hash,
} from "lucide-react";

export function GithubView() {
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
