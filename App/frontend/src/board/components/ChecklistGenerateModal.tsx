import { useEffect, useState } from "react";
import { Sparkles, X, Plus, Trash2 } from "lucide-react";
import type { ChecklistItem } from "../libs/types/task";
import { generateChecklistPreview, applyGeneratedChecklist } from "../libs/utils/checklistApi";

interface Row { title: string; selected: boolean; }

interface Props {
  taskId: string;
  projectId: number;
  open: boolean;
  onClose: () => void;
  onApplied: (items: ChecklistItem[]) => void;
  onShowToast: (msg: string) => void;
}

export default function ChecklistGenerateModal({ taskId, projectId, open, onClose, onApplied, onShowToast }: Props) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [rows, setRows] = useState<Row[]>([]);
  const [engine, setEngine] = useState("");
  const [applying, setApplying] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState("loading");
    generateChecklistPreview(taskId, projectId)
      .then((res) => {
        if (cancelled) return;
        setRows(res.titles.map((t) => ({ title: t, selected: true })));
        setEngine(res.engine);
        setState("ready");
      })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [open, taskId, projectId, retryKey]);

  if (!open) return null;

  const toggle = (i: number) => setRows((c) => c.map((r, idx) => (idx === i ? { ...r, selected: !r.selected } : r)));
  const editTitle = (i: number, title: string) => setRows((c) => c.map((r, idx) => (idx === i ? { ...r, title } : r)));
  const removeRow = (i: number) => setRows((c) => c.filter((_, idx) => idx !== i));
  const addRow = () => setRows((c) => [...c, { title: "", selected: true }]);

  const handleApply = async () => {
    const titles = rows.filter((r) => r.selected).map((r) => r.title.trim()).filter(Boolean);
    if (titles.length === 0) { onShowToast("추가할 항목을 선택하세요."); return; }
    setApplying(true);
    try {
      const saved = await applyGeneratedChecklist(taskId, titles, projectId);
      onApplied(saved);
      onShowToast(`체크리스트 ${saved.length}개를 추가했습니다.`);
      onClose();
    } catch {
      onShowToast("체크리스트 추가에 실패했습니다.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "#7048E8" }}>
              <Sparkles className="w-4 h-4" />체크리스트 자동 생성
            </div>
            <button onClick={onClose} aria-label="닫기" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>

          {engine === "rule-based" && (
            <div className="mb-2 text-[11px] text-amber-600 font-medium">AI 미사용 · 기본 추천 항목입니다.</div>
          )}

          {state === "loading" && <div className="text-xs text-muted-foreground py-6 text-center">생성 중...</div>}
          {state === "error" && (
            <div className="py-6 text-center">
              <div className="text-xs text-red-600 mb-2">항목을 생성하지 못했습니다.</div>
              <button onClick={() => setRetryKey((k) => k + 1)} className="text-xs underline">다시 시도</button>
            </div>
          )}

          {state === "ready" && (
            <>
              <div className="flex-1 overflow-y-auto scrollbar-thin space-y-1.5">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                    <input type="checkbox" checked={row.selected} onChange={() => toggle(i)} />
                    <input
                      value={row.title}
                      onChange={(e) => editTitle(i, e.target.value)}
                      className="flex-1 text-xs font-medium bg-transparent outline-none border-b border-transparent focus:border-border"
                      placeholder="체크리스트 내용"
                    />
                    <button onClick={() => removeRow(i)} aria-label="삭제" className="text-muted-foreground hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button onClick={addRow} className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg">
                  <Plus className="w-3.5 h-3.5" />항목 추가
                </button>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted">취소</button>
                <button onClick={handleApply} disabled={applying} className="px-4 py-2 text-xs font-semibold text-white rounded-xl disabled:opacity-50" style={{ background: "#7048E8" }}>
                  {applying ? "추가 중..." : "선택 항목 추가"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
