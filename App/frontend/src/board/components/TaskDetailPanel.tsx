import { useEffect, useState } from "react";
import { Sparkles, X, Send, Check, MoreHorizontal, ChevronDown, Trash2 } from "lucide-react";
import { CatTag } from "./CatTag";
import { TaskStatusPill } from "./TaskStatusPill";
import { PriorityBadge } from "./PriorityBadge";
import { LabelBadge } from "../../global/component/LabelBadge";
import { getCat, buildDefaultChecklist, formatDueDate } from "../libs/utils/taskService";
import { getCatDetailFields, CAT_AI_BTN } from "../libs/utils/catFields";
import { STATUS_ACTIONS, STATUS_LABELS } from "../libs/utils/taskActions";
import { MEMBERS } from "../../global/lib/mock/members";
import { addComment, addNotification, addActivity, type Comment } from "../libs/utils/activityStore";
import type { Task } from "../libs/types/task";

const CURRENT_USER = MEMBERS[0];

type FeedType = "comment" | "status" | "ai" | "github";
interface FeedItem { id: string; type: FeedType; who: string; when: string; msg: string; }

const DOT_COLOR: Record<FeedType, string> = {
  comment: "#3B5BDB",
  status: "#64748B",
  ai: "#7048E8",
  github: "#374151",
};

interface TaskDetailPanelProps {
  task: Task;
  comments: Comment[];
  onClose: () => void;
  onQuickAction: (label: string, isPrimary: boolean) => void;
  onToggleChecklistItem: (itemId: string) => void;
  onShowToast: (message: string) => void;
  onDeleteTask: (taskId: string) => void;
}

export function TaskDetailPanel({ task, comments, onClose, onQuickAction, onToggleChecklistItem, onShowToast, onDeleteTask }: TaskDetailPanelProps) {
  const [devInfoOpen, setDevInfoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commentSentMessage, setCommentSentMessage] = useState<string | null>(null);

  useEffect(() => {
    setDevInfoOpen(false);
    setMenuOpen(false);
    setConfirmingDelete(false);
    setNewComment("");
    setCommentSentMessage(null);
  }, [task.id]);

  const taskCat = task.category;
  const catDef = getCat(taskCat);
  const taskComments = comments.filter((c) => c.taskId === task.id);
  const checklist = task.checklist ?? buildDefaultChecklist(task.id, task.status);
  const doneCount = checklist.filter((c) => c.done).length;
  const progressPct = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0;
  const m = MEMBERS.find((me) => me.id === task.assignee)!;
  const actions = STATUS_ACTIONS[task.status] ?? [];
  const primaryAction = actions.find((a) => a.primary);
  const secondaryActions = actions.filter((a) => !a.primary);
  const catFields = getCatDetailFields(task.id, taskCat);
  const aiBtn = CAT_AI_BTN[taskCat] ?? CAT_AI_BTN["default"];

  const nextActionHint =
    catDef.id === "frontend" ? "Figma 설계를 먼저 확인하고 컴포넌트 구조를 설계하세요" :
    catDef.id === "backend" ? "API 명세를 먼저 작성하고 팀원과 공유하세요" :
    catDef.id === "ai-ml" ? "데이터 품질을 먼저 확인 후 모델 학습을 시작하세요" :
    "담당자에게 현재 진행 상황을 요청하세요";

  const riskMsg = task.status === "blocked"
    ? "현재 블로커 상태로 연결 업무에 지연이 발생할 수 있습니다. 오늘 내 해결이 필요합니다."
    : "현재 속도 기준 정상 진행 중입니다. 마감 전에 완료될 가능성이 높습니다.";

  const feedItems: FeedItem[] = [
    ...taskComments.map((c): FeedItem => ({
      id: c.id,
      type: "comment",
      who: c.authorName,
      when: new Date(c.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }),
      msg: c.text,
    })),
    { id: "static-status-1", type: "status", who: "김민준", when: "3시간 전", msg: `상태를 '${STATUS_LABELS[task.status]}'(으)로 변경` },
    { id: "static-comment-1", type: "comment", who: "박지수", when: "어제", msg: "초안 검토 완료, 피드백 첨부했습니다." },
    { id: "static-ai-created", type: "ai", who: "회의록 AI", when: "어제", msg: "6차 회의에서 이 업무가 자동 생성되었습니다." },
    { id: "static-ai-summary", type: "ai", who: "AI 요약", when: "방금", msg: `마감까지 8일 남았습니다. ${nextActionHint}.` },
    ...(task.status !== "done" ? [{ id: "static-ai-risk", type: "ai" as const, who: "AI 위험 분석", when: "방금", msg: riskMsg }] : []),
    { id: "static-status-2", type: "status", who: "이서연", when: "2일 전", msg: "담당자를 '김민준'으로 변경했습니다." },
    { id: "static-github", type: "github", who: "GitHub", when: "3일 전", msg: `브랜치 feature/${task.id.toLowerCase()} 연결됨` },
  ];

  const handleSendComment = () => {
    if (!newComment.trim()) return;
    addComment(task.id, CURRENT_USER.id, CURRENT_USER.name, newComment.trim());
    const assignee = MEMBERS.find((mm) => mm.id === task.assignee);
    if (assignee) {
      addNotification(assignee.id, `${CURRENT_USER.name} 팀장이 '${task.title}' 업무에 코멘트를 남겼습니다.`, task.id);
    }
    addActivity(`'${task.title}' 업무에 코멘트를 남겼습니다: "${newComment.trim().slice(0, 40)}"`, CURRENT_USER.name, "comment");
    setNewComment("");
    setCommentSentMessage("코멘트 전송 완료");
    setTimeout(() => setCommentSentMessage(null), 2200);
  };

  return (
    <div className="w-full h-full bg-card border-l border-border flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-start justify-between mb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <CatTag catId={taskCat} />
            <TaskStatusPill status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
          <div className="relative flex items-center gap-1 shrink-0">
            <button onClick={() => setMenuOpen((o) => !o)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-20 w-48 bg-card border border-border rounded-xl shadow-lg py-1.5">
                  {secondaryActions.map((a) => {
                    const Icon = a.icon;
                    return (
                      <button
                        key={a.label}
                        onClick={() => { onQuickAction(a.label, false); setMenuOpen(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-muted text-left transition-colors ${a.danger ? "text-red-600" : "text-foreground"}`}
                      >
                        <Icon className="w-3.5 h-3.5" />{a.label}
                      </button>
                    );
                  })}
                  <div className="my-1 border-t border-border" />
                  <button
                    onClick={() => { onShowToast(aiBtn); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-muted text-left transition-colors"
                    style={{ color: "#7048E8" }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />{aiBtn}
                  </button>
                  <button
                    onClick={() => { onShowToast("준비 중인 기능입니다."); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-muted text-left transition-colors"
                    style={{ color: "#7048E8" }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />체크리스트 자동 생성
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    onClick={() => { setMenuOpen(false); setConfirmingDelete(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-muted text-left transition-colors text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />업무 삭제
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="text-sm font-bold text-foreground leading-snug">{task.title}</div>
        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{task.id}</div>
      </div>

      {confirmingDelete && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setConfirmingDelete(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
              <div className="text-sm font-bold text-foreground mb-1.5">업무를 삭제할까요?</div>
              <div className="text-xs text-muted-foreground mb-4">'{task.title}' 업무를 삭제하면 되돌릴 수 없습니다.</div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="px-4 py-2 text-xs font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={() => { setConfirmingDelete(false); onDeleteTask(task.id); }}
                  className="px-4 py-2 text-xs font-semibold text-white rounded-xl bg-red-600 hover:bg-red-700 transition-colors"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* 담당자 / 마감일 */}
        <div className="p-4 border-b border-border grid grid-cols-2 gap-3">
          <div>
            <div className="text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">담당자</div>
            <div className="flex items-center gap-1.5">
              <div className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ background: m.color }}>
                {m.initials}
              </div>
              <span className="text-xs font-semibold text-foreground">{m.name}</span>
            </div>
          </div>
          <div>
            <div className="text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">마감일</div>
            <div className="text-xs font-semibold text-foreground">{formatDueDate(task.dueDate)} <span className="text-amber-600">D-8</span></div>
          </div>
        </div>

        {/* 체크리스트 + 진행률 + 주요 액션 */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-muted-foreground">체크리스트 {doneCount}/{checklist.length}</span>
            <span className="text-[11px] font-bold text-emerald-600">{progressPct}%</span>
          </div>
          <div className="text-[9.5px] text-muted-foreground mb-2">체크리스트·코멘트·활동 기록은 아직 이 브라우저에만 저장됩니다 (서버 연동 예정)</div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          {checklist.map((item) => (
            <div key={item.id} onClick={() => onToggleChecklistItem(item.id)} className="flex items-center gap-2 py-1 cursor-pointer select-none">
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${item.done ? "bg-emerald-500 border-emerald-500" : "border-border hover:border-blue-400"}`}>
                {item.done && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span className={`text-xs ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{item.label}</span>
            </div>
          ))}
          {primaryAction && (
            <button
              onClick={() => onQuickAction(primaryAction.label, true)}
              className="w-full flex items-center justify-center gap-1.5 mt-3 py-2.5 text-xs font-semibold rounded-xl text-white hover:opacity-90 transition-opacity"
              style={{ background: "linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}
            >
              {primaryAction.label}<primaryAction.icon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 개발 정보 아코디언 */}
        <div className="p-4 border-b border-border">
          <button
            onClick={() => setDevInfoOpen((o) => !o)}
            className="w-full flex items-center justify-between border border-border rounded-xl px-3 py-2.5 hover:bg-muted transition-colors"
          >
            <span className="text-xs font-bold text-foreground">{catDef.label} 정보</span>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${devInfoOpen ? "" : "-rotate-90"}`} />
          </button>
          {devInfoOpen && (
            <div className="mt-2 bg-muted/40 rounded-xl p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-muted-foreground w-16 shrink-0 pt-0.5">완료 기준</span>
                <span className="text-xs font-medium text-foreground flex-1 leading-relaxed">담당자 자체 검수 후 팀장 최종 승인 시 완료 처리</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-muted-foreground w-16 shrink-0 pt-0.5">마일스톤</span>
                <span className="text-xs font-medium text-blue-600 flex-1">M3: 핵심 기능 개발</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-muted-foreground w-16 shrink-0 pt-0.5">레이블</span>
                <div className="flex flex-wrap gap-1 flex-1">{task.labels.map((l) => <LabelBadge key={l} label={l} />)}</div>
              </div>
              {catFields.map(([label, value]) => (
                <div key={label} className="flex items-start gap-2">
                  <span className="text-[10px] text-muted-foreground w-16 shrink-0 pt-0.5">{label}</span>
                  <span className="text-xs font-medium text-foreground flex-1 break-words leading-relaxed">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="p-4">
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Activity Feed</div>
          {feedItems.map((item) => (
            <div key={item.id} className="flex gap-2.5 mb-3 last:mb-0">
              <div className="pt-1.5 shrink-0">
                <span className="block w-1.5 h-1.5 rounded-full" style={{ background: DOT_COLOR[item.type] }} />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-foreground">{item.who}</span>
                <span className="text-[10px] text-muted-foreground ml-1.5">{item.when}</span>
                <div className="text-xs text-muted-foreground mt-0.5">{item.msg}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 댓글 입력 (하단 고정) */}
      <div className="p-4 border-t border-border shrink-0">
        <div className="flex gap-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={2}
            placeholder="팀원에게 코멘트를 남기세요..."
            className="flex-1 text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none"
          />
          <button onClick={handleSendComment} disabled={!newComment.trim()} className="self-end p-2 rounded-lg text-white shrink-0 disabled:opacity-40" style={{ background: "var(--primary)" }}>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        {commentSentMessage && <div className="text-[10px] text-emerald-600 mt-1.5">{commentSentMessage}</div>}
      </div>
    </div>
  );
}
