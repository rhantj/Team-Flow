export type Tab = "dashboard" | "board" | "meetings" | "deliverables" | "github" | "contributors" | "mypage";
export type TaskStatus = "todo" | "inprogress" | "done" | "blocked";
export type Priority = "high" | "medium" | "low";
export type DetailPage = "all-tasks" | "progress" | "blockers" | "inprogress" | "dash-progress" | "urgent" | "workload" | "activity" | null;

export interface ChecklistItem { id: string; label: string; done: boolean; }

export interface Task {
  id: string; title: string; status: TaskStatus; priority: Priority;
  assignee: string; /** ISO 형식 YYYY-MM-DD. 화면 표시는 formatDueDate()로 변환해서 사용 */ dueDate: string; labels: string[];
  /** 카테고리(CatId 값이면 아이콘/색상까지 적용, 아니면 CatTag가 "기타"로 표시) */
  category: string;
  /** 같은 status 안에서의 칸반 카드 순서(오름차순). 컬럼 간 값 비교는 하지 않음 */
  position: number;
  sourceMeetingTitle?: string;
}

export type CatId = "planning"|"research"|"ux-ui"|"design"|"frontend"|"backend"|"ai-ml"|"data"|"db"|"devops"|"github"|"qa"|"security"|"docs"|"presentation"|"deliverable"|"operation"|"other";
export interface CategoryDef { id: CatId; label: string; desc: string; icon: any; color: string; bg: string; }
