import { useEffect, useState } from "react";
import { Sparkles, X, Send, Check, MoreHorizontal, ChevronDown, Trash2, Pencil, Plus } from "lucide-react";
import { CatTag } from "./CatTag";
import { TaskStatusPill } from "./TaskStatusPill";
import { PriorityBadge } from "./PriorityBadge";
import { LabelBadge } from "../../global/component/LabelBadge";
import { getCat, formatDueDate } from "../libs/utils/taskService";
import { getCatDetailFields, CAT_AI_BTN } from "../libs/utils/catFields";
import { STATUS_ACTIONS } from "../libs/utils/taskActions";
import { MEMBERS } from "../../global/lib/mock/members";
import { addNotification } from "../libs/utils/activityStore";
import { fetchChecklist, createChecklistItem, updateChecklistItem, deleteChecklistItem } from "../libs/utils/checklistApi";
import { fetchTaskComments, createTaskComment, updateTaskComment, deleteTaskComment, type TaskCommentDto } from "../libs/utils/taskCommentApi";
import { fetchTaskActivity, type TaskActivityDto } from "../libs/utils/activityApi";
import { DEMO_PROJECT_ID } from "../libs/utils/taskApi";
import { useAuth } from "../../global/hooks/useAuth";
import type { Task, ChecklistItem } from "../libs/types/task";

const CURRENT_USER = MEMBERS[0];

type FeedType = "comment" | "status" | "system";
interface FeedItem { id: string; type: FeedType; who: string; when: string; msg: string; at: number; commentId?: string; }

const DOT_COLOR: Record<FeedType, string> = {
  comment: "#3B5BDB",
  status: "#64748B",
  system: "#9CA3AF",
};

// 활동 로그의 type은 저장/필터링용 세분류라, 화면 점 색깔은 3가지로만 단순화해서 보여준다.
const ACTIVITY_TYPE_TO_FEED_TYPE: Record<string, FeedType> = {
  STATUS_CHANGED: "status",
  TASK_CREATED: "system",
  TASK_UPDATED: "system",
  TASK_DELETED: "system",
  ASSIGNEE_CHANGED: "system",
  CHECKLIST_CREATED: "system",
  CHECKLIST_COMPLETED: "system",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// 마감일까지 남은/지난 일수를 실제로 계산한다(예전엔 모든 업무에 "D-8"이 고정으로 찍혀 있었음).
function formatDDay(iso: string): string | null {
  if (!iso) return null;
  const due = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return "D-day";
  return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;
}

// 아직 실제로 동작하지 않는 버튼임을 명확히 표시한다(눌러보기 전에 미리 알 수 있도록).
function WipBadge() {
  return <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">준비 중</span>;
}

interface TaskDetailPanelProps {
  task: Task;
  onClose: () => void;
  onQuickAction: (label: string, isPrimary: boolean) => void;
  onShowToast: (message: string) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: () => void;
}

export function TaskDetailPanel({ task, onClose, onQuickAction, onShowToast, onDeleteTask, onEditTask }: TaskDetailPanelProps) {
  const { currentProjectId } = useAuth();
  const projectId = currentProjectId ?? DEMO_PROJECT_ID;
  const [devInfoOpen, setDevInfoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commentSentMessage, setCommentSentMessage] = useState<string | null>(null);

  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checklistState, setChecklistState] = useState<"loading" | "ready" | "error">("loading");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const [taskComments, setTaskComments] = useState<TaskCommentDto[]>([]);
  const [commentsState, setCommentsState] = useState<"loading" | "ready" | "error">("loading");
  const [sendingComment, setSendingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");

  const [activity, setActivity] = useState<TaskActivityDto[]>([]);
  const [activityState, setActivityState] = useState<"loading" | "ready" | "error">("loading");

  // task.id가 바뀔 때만(=다른 업무를 열 때만) 패널 UI 상태를 초기화하고 체크리스트/코멘트를 새로 불러온다.
  useEffect(() => {
    setDevInfoOpen(false);
    setMenuOpen(false);
    setConfirmingDelete(false);
    setNewComment("");
    setCommentSentMessage(null);
    setNewItemTitle("");
    setEditingItemId(null);
    setEditingCommentId(null);

    let cancelled = false;
    setChecklistState("loading");
    fetchChecklist(task.id, projectId)
      .then((items) => {
        if (!cancelled) {
          setChecklist(items);
          setChecklistState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setChecklistState("error");
      });

    setCommentsState("loading");
    fetchTaskComments(task.id, projectId)
      .then((items) => {
        if (!cancelled) {
          setTaskComments(items);
          setCommentsState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setCommentsState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [task.id]);

  // task 객체 자체가 바뀔 때마다(패널을 열어둔 채로 상태변경/수정을 해도) 활동 로그를 다시 불러온다.
  useEffect(() => {
    let cancelled = false;
    setActivityState("loading");
    fetchTaskActivity(task.id, projectId)
      .then((items) => {
        if (!cancelled) {
          setActivity(items);
          setActivityState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setActivityState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [task]);

  const handleToggleChecklistItem = async (itemId: string) => {
    const target = checklist.find((c) => c.id === itemId);
    if (!target) return;
    const prev = checklist;
    setChecklist((cur) => cur.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)));
    try {
      await updateChecklistItem(task.id, itemId, { done: !target.done }, projectId);
    } catch {
      setChecklist(prev);
      onShowToast("체크리스트 변경에 실패했습니다.");
    }
  };

  const handleAddChecklistItem = async () => {
    const title = newItemTitle.trim();
    if (!title || addingItem) return;
    setAddingItem(true);
    try {
      const created = await createChecklistItem(task.id, title, projectId);
      setChecklist((cur) => [...cur, created]);
      setNewItemTitle("");
    } catch {
      onShowToast("체크리스트 추가에 실패했습니다.");
    } finally {
      setAddingItem(false);
    }
  };

  const handleStartEditChecklistItem = (item: ChecklistItem) => {
    setEditingItemId(item.id);
    setEditingText(item.label);
  };

  const handleSaveEditChecklistItem = async () => {
    const itemId = editingItemId;
    const title = editingText.trim();
    if (!itemId) return;
    if (!title) {
      setEditingItemId(null);
      return;
    }
    const prev = checklist;
    setChecklist((cur) => cur.map((c) => (c.id === itemId ? { ...c, label: title } : c)));
    setEditingItemId(null);
    try {
      await updateChecklistItem(task.id, itemId, { title }, projectId);
    } catch {
      setChecklist(prev);
      onShowToast("체크리스트 수정에 실패했습니다.");
    }
  };

  const handleDeleteChecklistItem = async (itemId: string) => {
    const prev = checklist;
    setChecklist((cur) => cur.filter((c) => c.id !== itemId));
    try {
      await deleteChecklistItem(task.id, itemId, projectId);
    } catch {
      setChecklist(prev);
      onShowToast("체크리스트 삭제에 실패했습니다.");
    }
  };

  const taskCat = task.category;
  const catDef = getCat(taskCat);
  const dday = formatDDay(task.dueDate);
  const doneCount = checklist.filter((c) => c.done).length;
  const progressPct = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0;
  const m = MEMBERS.find((me) => me.id === task.assignee)!;
  const actions = STATUS_ACTIONS[task.status] ?? [];
  const primaryAction = actions.find((a) => a.primary);
  const secondaryActions = actions.filter((a) => !a.primary);
  const catFields = getCatDetailFields(task.id, taskCat);
  const aiBtn = CAT_AI_BTN[taskCat] ?? CAT_AI_BTN["default"];

  // 실제로 저장된 코멘트 + 이 업무에서 실제로 일어난 활동 로그만 보여준다(더미 항목 없음).
  // 코멘트 작성 자체는 taskComments가 이미 기록이라, 백엔드는 별도로 "코멘트 작성" 활동을 남기지 않는다(중복 방지).
  const feedItems: FeedItem[] = [
    ...taskComments.map((c): FeedItem => ({
      id: `comment-${c.id}`,
      commentId: c.id,
      type: "comment",
      who: c.authorName,
      when: formatTimestamp(c.createdAt),
      msg: c.content,
      at: new Date(c.createdAt).getTime(),
    })),
    ...activity.map((a): FeedItem => ({
      id: a.id,
      type: ACTIVITY_TYPE_TO_FEED_TYPE[a.type] ?? "system",
      who: a.actorName,
      when: formatTimestamp(a.createdAt),
      msg: a.message,
      at: new Date(a.createdAt).getTime(),
    })),
  ].sort((x, y) => y.at - x.at);

  const handleSendComment = async () => {
    const text = newComment.trim();
    if (!text || sendingComment) return;
    setSendingComment(true);
    try {
      const created = await createTaskComment(task.id, CURRENT_USER.id, text, projectId);
      setTaskComments((cur) => [...cur, created]);
      const assignee = MEMBERS.find((mm) => mm.id === task.assignee);
      if (assignee) {
        addNotification(assignee.id, `${CURRENT_USER.name} 팀장이 '${task.title}' 업무에 코멘트를 남겼습니다.`, task.id);
      }
      setNewComment("");
      setCommentSentMessage("코멘트 전송 완료");
      setTimeout(() => setCommentSentMessage(null), 2200);
    } catch {
      onShowToast("코멘트 전송에 실패했습니다.");
    } finally {
      setSendingComment(false);
    }
  };

  const handleStartEditComment = (item: FeedItem) => {
    if (!item.commentId) return;
    setEditingCommentId(item.commentId);
    setEditingCommentText(item.msg);
  };

  const handleSaveEditComment = async () => {
    const commentId = editingCommentId;
    const text = editingCommentText.trim();
    if (!commentId) return;
    if (!text) {
      setEditingCommentId(null);
      return;
    }
    const prev = taskComments;
    setTaskComments((cur) => cur.map((c) => (c.id === commentId ? { ...c, content: text } : c)));
    setEditingCommentId(null);
    try {
      await updateTaskComment(task.id, commentId, text, projectId);
    } catch {
      setTaskComments(prev);
      onShowToast("코멘트 수정에 실패했습니다.");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const prev = taskComments;
    setTaskComments((cur) => cur.filter((c) => c.id !== commentId));
    try {
      await deleteTaskComment(task.id, commentId, projectId);
    } catch {
      setTaskComments(prev);
      onShowToast("코멘트 삭제에 실패했습니다.");
    }
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
            <button onClick={onEditTask} className="p-1.5 hover:bg-muted rounded-lg transition-colors" title="업무 수정">
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={() => setMenuOpen((o) => !o)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-20 w-52 bg-card border border-border rounded-xl shadow-lg py-1.5">
                  {secondaryActions.map((a) => {
                    const Icon = a.icon;
                    return (
                      <button
                        key={a.label}
                        onClick={() => { onQuickAction(a.label, false); setMenuOpen(false); }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium hover:bg-muted text-left transition-colors ${a.danger ? "text-red-600" : "text-foreground"}`}
                      >
                        <span className="flex items-center gap-2"><Icon className="w-3.5 h-3.5" />{a.label}</span>
                        <WipBadge />
                      </button>
                    );
                  })}
                  <div className="my-1 border-t border-border" />
                  <button
                    onClick={() => { onShowToast("준비 중인 기능입니다."); setMenuOpen(false); }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium hover:bg-muted text-left transition-colors"
                    style={{ color: "#7048E8" }}
                  >
                    <span className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5" />{aiBtn}</span>
                    <WipBadge />
                  </button>
                  <button
                    onClick={() => { onShowToast("준비 중인 기능입니다."); setMenuOpen(false); }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium hover:bg-muted text-left transition-colors"
                    style={{ color: "#7048E8" }}
                  >
                    <span className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5" />체크리스트 자동 생성</span>
                    <WipBadge />
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
            <div className="text-xs font-semibold text-foreground">
              {formatDueDate(task.dueDate)} {dday && <span className={dday.startsWith("D+") ? "text-red-600" : "text-amber-600"}>{dday}</span>}
            </div>
          </div>
        </div>

        {/* 체크리스트 + 진행률 + 주요 액션 */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-muted-foreground">체크리스트 {doneCount}/{checklist.length}</span>
            <span className="text-[11px] font-bold text-emerald-600">{progressPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
          </div>

          {checklistState === "loading" && <div className="text-xs text-muted-foreground py-1">불러오는 중...</div>}
          {checklistState === "error" && <div className="text-xs text-red-600 py-1">체크리스트를 불러오지 못했습니다.</div>}
          {checklistState === "ready" && checklist.length === 0 && (
            <div className="text-xs text-muted-foreground py-1">체크리스트가 없습니다. 아래에서 추가해보세요.</div>
          )}
          {checklistState === "ready" && checklist.map((item) => (
            <div key={item.id} className="group flex items-center gap-2 py-1">
              <div
                onClick={() => handleToggleChecklistItem(item.id)}
                className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${item.done ? "bg-emerald-500 border-emerald-500" : "border-border hover:border-blue-400"}`}
              >
                {item.done && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              {editingItemId === item.id ? (
                <input
                  autoFocus
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onBlur={handleSaveEditChecklistItem}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEditChecklistItem();
                    if (e.key === "Escape") setEditingItemId(null);
                  }}
                  className="flex-1 text-xs rounded border border-blue-300 px-1.5 py-0.5 outline-none"
                />
              ) : (
                <span
                  onClick={() => handleStartEditChecklistItem(item)}
                  className={`flex-1 text-xs cursor-text ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}
                >
                  {item.label}
                </span>
              )}
              <button
                onClick={() => handleDeleteChecklistItem(item.id)}
                className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-opacity"
              >
                <Trash2 className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          ))}
          {checklistState === "ready" && (
            <div className="flex items-center gap-1.5 mt-2">
              <input
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddChecklistItem(); }}
                placeholder="체크리스트 항목 추가"
                className="flex-1 text-xs rounded-lg border border-border bg-input-background px-2.5 py-1.5 outline-none focus:border-blue-400"
              />
              <button
                onClick={handleAddChecklistItem}
                disabled={!newItemTitle.trim() || addingItem}
                className="shrink-0 p-1.5 rounded-lg text-white disabled:opacity-40 transition-opacity"
                style={{ background: "var(--primary)" }}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
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
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Activity Feed</span>
          </div>
          <div className="text-[9.5px] text-muted-foreground mb-3">이 업무에서 실제로 일어난 코멘트·상태변경·수정 기록입니다.</div>

          {(commentsState === "loading" || activityState === "loading") && (
            <div className="text-xs text-muted-foreground py-2">불러오는 중...</div>
          )}
          {commentsState === "error" && activityState !== "loading" && (
            <div className="text-xs text-red-600 py-2">코멘트를 불러오지 못했습니다.</div>
          )}
          {activityState === "error" && commentsState !== "loading" && (
            <div className="text-xs text-red-600 py-2">활동 기록을 불러오지 못했습니다.</div>
          )}
          {commentsState !== "loading" && activityState !== "loading" && feedItems.length === 0 && (
            <div className="text-xs text-muted-foreground py-2">아직 활동 내역이 없습니다.</div>
          )}
          {commentsState !== "loading" && activityState !== "loading" && feedItems.map((item) => (
            <div key={item.id} className="group flex gap-2.5 mb-3 last:mb-0">
              <div className="pt-1.5 shrink-0">
                <span className="block w-1.5 h-1.5 rounded-full" style={{ background: DOT_COLOR[item.type] }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-foreground">{item.who}</span>
                  <span className="text-[10px] text-muted-foreground">{item.when}</span>
                  {item.commentId && (
                    <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleStartEditComment(item)} className="p-0.5 rounded hover:bg-muted">
                        <Pencil className="w-3 h-3 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDeleteComment(item.commentId!)} className="p-0.5 rounded hover:bg-muted">
                        <Trash2 className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </span>
                  )}
                </div>
                {editingCommentId === item.commentId ? (
                  <textarea
                    autoFocus
                    value={editingCommentText}
                    onChange={(e) => setEditingCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEditComment(); }
                      if (e.key === "Escape") setEditingCommentId(null);
                    }}
                    rows={2}
                    className="w-full mt-1 text-xs rounded-lg border border-blue-300 px-2 py-1.5 outline-none resize-none"
                  />
                ) : (
                  <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{item.msg}</div>
                )}
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendComment(); }
            }}
            rows={2}
            placeholder="팀원에게 코멘트를 남기세요... (Shift+Enter: 줄바꿈)"
            className="flex-1 text-xs rounded-lg border border-border bg-input-background px-3 py-2 outline-none focus:border-blue-400 resize-none"
          />
          <button onClick={handleSendComment} disabled={!newComment.trim() || sendingComment} className="self-end p-2 rounded-lg text-white shrink-0 disabled:opacity-40" style={{ background: "var(--primary)" }}>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        {commentSentMessage && <div className="text-[10px] text-emerald-600 mt-1.5">{commentSentMessage}</div>}
      </div>
    </div>
  );
}
