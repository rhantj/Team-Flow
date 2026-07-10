export type Tab = "dashboard" | "board" | "meetings" | "deliverables" | "github" | "contributors" | "mypage";
export type TaskStatus = "todo" | "inprogress" | "done" | "blocked";
export type Priority = "high" | "medium" | "low";
export type DetailPage = "all-tasks" | "progress" | "blockers" | "inprogress" | "dash-progress" | "urgent" | "workload" | "activity" | null;

export interface Task {
  id: string; title: string; status: TaskStatus; priority: Priority;
  assignee: string; dueDate: string; labels: string[];
}

export type CatId = "planning"|"research"|"ux-ui"|"design"|"frontend"|"backend"|"ai-ml"|"data"|"db"|"devops"|"github"|"qa"|"security"|"docs"|"presentation"|"deliverable"|"operation"|"other";
export interface CategoryDef { id: CatId; label: string; desc: string; icon: any; color: string; bg: string; }
