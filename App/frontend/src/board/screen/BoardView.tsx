import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { BoardToolbar } from "../components/BoardToolbar";
import { KanbanBoard } from "../components/KanbanBoard";
import { TaskDetailPanel } from "../components/TaskDetailPanel";
import { AddTaskModal } from "../components/AddTaskModal";
import { useStoredTasks } from "../../global/hooks/useStoredTasks";
import { getStoredTasks, saveStoredTasks } from "../libs/utils/localStore";
import { useStoredComments, addActivity } from "../libs/utils/activityStore";
import { STATUS_LABELS, NEXT_STATUS } from "../libs/utils/taskActions";
import { buildDefaultChecklist } from "../libs/utils/taskService";
import { MEMBERS } from "../../global/lib/mock/members";
import type { Task, TaskStatus } from "../libs/types/task";

const CURRENT_USER = MEMBERS[0];

export function BoardView() {
  const tasks = useStoredTasks();
  const comments = useStoredComments();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selId, setSelId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalStatus, setModalStatus] = useState<TaskStatus>("todo");
  const [toast, setToast] = useState<string | null>(null);

  const selTask = selId ? tasks.find((t) => t.id === selId) ?? null : null;

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const openModal = (status: TaskStatus) => {
    setModalStatus(status);
    setShowModal(true);
  };

  useEffect(() => {
    if (searchParams.get("openAdd") === "1") {
      openModal("todo");
      const next = new URLSearchParams(searchParams);
      next.delete("openAdd");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateTask = (taskId: string, patch: Partial<Task>) => {
    const next = getStoredTasks().map((t) => (t.id === taskId ? { ...t, ...patch } : t));
    saveStoredTasks(next);
  };

  const handleSelectTask = (id: string) => {
    setSelId((prev) => (prev === id ? null : id));
  };

  const handleToggleChecklistItem = (itemId: string) => {
    if (!selTask) return;
    const checklist = selTask.checklist ?? buildDefaultChecklist(selTask.id, selTask.status);
    const updated = checklist.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item));
    updateTask(selTask.id, { checklist: updated });
  };

  const handleQuickAction = (label: string, isPrimary: boolean) => {
    if (!selTask) return;
    if (isPrimary) {
      const nextStatus = selTask.status === "done" ? "inprogress" : NEXT_STATUS[selTask.status];
      if (nextStatus) {
        updateTask(selTask.id, { status: nextStatus });
        addActivity(`'${selTask.title}' 상태를 '${STATUS_LABELS[nextStatus]}'(으)로 변경`, CURRENT_USER.name, "status");
        showToast(`${label} 완료`);
        return;
      }
    }
    showToast("준비 중인 기능입니다.");
  };

  const handleDropTask = (taskId: string, status: TaskStatus) => {
    const current = getStoredTasks();
    const task = current.find((t) => t.id === taskId);
    if (!task) return;
    const statusChanged = task.status !== status;
    const next = current.filter((t) => t.id !== taskId);
    next.push(statusChanged ? { ...task, status } : task);
    saveStoredTasks(next);
    if (statusChanged) {
      addActivity(`'${task.title}' 상태를 '${STATUS_LABELS[status]}'(으)로 변경`, CURRENT_USER.name, "status");
    }
  };

  const handleReorderTask = (draggedId: string, targetId: string, position: "before" | "after") => {
    if (draggedId === targetId) return;
    const current = getStoredTasks();
    const draggedIndex = current.findIndex((t) => t.id === draggedId);
    const targetTask = current.find((t) => t.id === targetId);
    if (draggedIndex === -1 || !targetTask) return;
    const dragged = current[draggedIndex];
    const statusChanged = dragged.status !== targetTask.status;

    const next = current.filter((t) => t.id !== draggedId);
    const targetIndex = next.findIndex((t) => t.id === targetId);
    const insertAt = position === "after" ? targetIndex + 1 : targetIndex;
    const movedTask = statusChanged ? { ...dragged, status: targetTask.status } : dragged;
    next.splice(insertAt, 0, movedTask);

    saveStoredTasks(next);
    if (statusChanged) {
      addActivity(`'${dragged.title}' 상태를 '${STATUS_LABELS[targetTask.status]}'(으)로 변경`, CURRENT_USER.name, "status");
    }
  };

  const workspaceMode = Boolean(selTask);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-full flex flex-col overflow-hidden relative" style={{ fontFamily: "'Inter','Noto Sans KR',sans-serif" }}>
        {toast && (
          <div className="fixed top-4 right-6 z-[60] px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow-lg" style={{ background: "#1C2333" }}>
            {toast}
          </div>
        )}

        <BoardToolbar tasks={tasks} compact={workspaceMode} onAddTask={openModal} />

        <div className="flex-1 overflow-hidden min-h-0">
          {workspaceMode && selTask ? (
            <PanelGroup direction="horizontal">
              <Panel defaultSize={68} minSize={40} className="min-w-0">
                <KanbanBoard
                  tasks={tasks}
                  compact
                  selectedId={selId}
                  onSelectTask={handleSelectTask}
                  onAddTask={openModal}
                  onDropTask={handleDropTask}
                  onReorderTask={handleReorderTask}
                />
              </Panel>
              <PanelResizeHandle className="group relative w-2.5 shrink-0 flex items-center justify-center outline-none cursor-col-resize">
                <div className="w-1 h-10 rounded-full bg-border transition-colors group-hover:bg-blue-300 group-active:bg-blue-400" />
              </PanelResizeHandle>
              <Panel defaultSize={32} minSize={24} maxSize={50} className="min-w-0">
                <TaskDetailPanel
                  task={selTask}
                  comments={comments}
                  onClose={() => setSelId(null)}
                  onQuickAction={handleQuickAction}
                  onToggleChecklistItem={handleToggleChecklistItem}
                  onShowToast={showToast}
                />
              </Panel>
            </PanelGroup>
          ) : (
            <KanbanBoard
              tasks={tasks}
              compact={false}
              selectedId={selId}
              onSelectTask={handleSelectTask}
              onAddTask={openModal}
              onDropTask={handleDropTask}
              onReorderTask={handleReorderTask}
            />
          )}
        </div>

        <AddTaskModal open={showModal} initialStatus={modalStatus} onClose={() => setShowModal(false)} />
      </div>
    </DndProvider>
  );
}
