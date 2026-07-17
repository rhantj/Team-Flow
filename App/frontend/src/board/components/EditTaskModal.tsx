import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CATEGORIES } from "../libs/mock/tasks";
import { getCat } from "../libs/utils/taskService";
import { updateTask, DEMO_PROJECT_ID } from "../libs/utils/taskApi";
import { MEMBERS } from "../../global/lib/mock/members";
import { useAuth } from "../../global/hooks/useAuth";
import type { Priority, Task } from "../libs/types/task";

interface EditTaskModalProps {
  task: Task | null;
  onClose: () => void;
  onUpdated: (task: Task) => void;
}

export function EditTaskModal({ task, onClose, onUpdated }: EditTaskModalProps) {
  const { currentProjectId } = useAuth();
  const [selCat, setSelCat] = useState("");
  const [customCat, setCustomCat] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("1");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    const knownCat = CATEGORIES.some((c) => c.id === task.category);
    setSelCat(knownCat ? task.category : "other");
    setCustomCat(knownCat ? "" : task.category);
    setTitle(task.title);
    setDescription("");
    setAssigneeId(task.assignee || "1");
    setDueDate(task.dueDate);
    setPriority(task.priority);
    setError(null);
  }, [task]);

  if (!task) return null;

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("업무 제목은 비워둘 수 없습니다.");
      return;
    }
    const category = selCat === "other" ? (customCat.trim() || "other") : selCat;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await updateTask(task.id, {
        title: title.trim(),
        category,
        assigneeId,
        dueDate: dueDate || undefined,
        priority,
        description: description.trim() || undefined,
      }, currentProjectId ?? DEMO_PROJECT_ID);
      onUpdated(updated);
    } catch {
      setError("수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-lg font-bold text-foreground">업무 수정</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">업무명 <span className="text-red-500">*</span></label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">업무 설명</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="업무의 목적과 범위를 간략히 설명하세요"
                className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">카테고리</label>
              <select
                value={selCat}
                onChange={(e) => setSelCat(e.target.value)}
                className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400"
              >
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              {selCat === "other" && (
                <input
                  value={customCat}
                  onChange={(e) => setCustomCat(e.target.value)}
                  placeholder="카테고리명을 직접 입력하세요 (예: 하드웨어, 영상 편집)"
                  className="mt-2 w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">담당자</label>
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400">
                  {MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">마감일</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">우선순위</label>
              <div className="flex gap-1.5">
                {(["low", "medium", "high"] as Priority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${priority === p ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border bg-card text-muted-foreground hover:border-slate-300"}`}
                  >
                    {p === "low" ? "낮음" : p === "medium" ? "중간" : "높음"}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">카테고리 미리보기: {getCat(selCat === "other" ? (customCat.trim() || "other") : selCat).label}</p>
          </div>

          <div className="flex flex-col gap-2 px-6 py-4 border-t border-border">
            {error && <div className="text-xs text-red-600">{error}</div>}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 hover:opacity-90 transition-opacity"
                style={{ background: "linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}
              >
                {submitting ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
