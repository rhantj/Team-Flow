import type { Priority, Task, TaskStatus } from "../types/task";
import { apiFetch } from "../../../global/api/apiClient";

// 로그인했지만 아직 어느 프로젝트에도 속하지 않은 경우(또는 project 컨텍스트가 없는 호출)에 쓰는 폴백 id.
// 백엔드 DemoDataService가 부팅 시 seed하는 데모 프로젝트가 신규 DB에서는 항상 첫 번째 row라 id=1이 된다.
export const DEMO_PROJECT_ID = 1;

interface TaskListItemDto {
  id: string;
  title: string;
  category: string | null;
  status: string;
  assigneeId: string | null;
  dueDate: string | null;
  priority: string | null;
  position: number;
  description: string | null;
}

const VALID_STATUSES: TaskStatus[] = ["todo", "inprogress", "blocked", "done"];
const VALID_PRIORITIES: Priority[] = ["low", "medium", "high"];

function normalizeStatus(raw: string): TaskStatus {
  const lower = raw.toLowerCase() as TaskStatus;
  return VALID_STATUSES.includes(lower) ? lower : "todo";
}

// 회의록 AI 등 다른 경로로 생성된 업무는 우선순위가 "HIGH"처럼 대문자이거나 비어있을 수 있어 방어적으로 정규화한다.
function normalizePriority(raw: string | null): Priority {
  const lower = (raw ?? "").toLowerCase() as Priority;
  return VALID_PRIORITIES.includes(lower) ? lower : "medium";
}

function toTask(dto: TaskListItemDto): Task {
  return {
    id: dto.id,
    title: dto.title,
    status: normalizeStatus(dto.status),
    priority: normalizePriority(dto.priority),
    assignee: dto.assigneeId ?? "",
    dueDate: dto.dueDate ?? "",
    category: dto.category ?? "other",
    labels: [],
    position: dto.position,
    description: dto.description ?? undefined,
  };
}

export async function fetchTasks(projectId: number = DEMO_PROJECT_ID): Promise<Task[]> {
  const items = await apiFetch<TaskListItemDto[]>(`/projects/${projectId}/tasks`);
  return items.map(toTask);
}

export interface CreateTaskInput {
  title: string;
  category: string;
  status: TaskStatus;
  assigneeId: string | null;
  dueDate: string | null;
  priority: Priority;
  description?: string;
}

export async function createTask(input: CreateTaskInput, projectId: number = DEMO_PROJECT_ID): Promise<Task> {
  const dto = await apiFetch<TaskListItemDto>(`/projects/${projectId}/tasks`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return toTask(dto);
}

export async function updateTaskPosition(
  taskId: string,
  status: TaskStatus,
  position: number,
  projectId: number = DEMO_PROJECT_ID
): Promise<Task> {
  const dto = await apiFetch<TaskListItemDto>(`/projects/${projectId}/tasks/${taskId}/position`, {
    method: "PATCH",
    body: JSON.stringify({ status, position }),
  });
  return toTask(dto);
}

export interface UpdateTaskInput {
  title?: string;
  category?: string;
  assigneeId?: string;
  dueDate?: string;
  priority?: Priority;
  description?: string;
}

export async function updateTask(taskId: string, input: UpdateTaskInput, projectId: number = DEMO_PROJECT_ID): Promise<Task> {
  const dto = await apiFetch<TaskListItemDto>(`/projects/${projectId}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return toTask(dto);
}

export async function deleteTask(taskId: string, projectId: number = DEMO_PROJECT_ID): Promise<void> {
  await apiFetch<null>(`/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
}

export type NudgeKind = "START" | "PROGRESS" | "URGENT";

export async function sendTaskNudge(taskId: string, kind: NudgeKind, projectId: number = DEMO_PROJECT_ID): Promise<void> {
  await apiFetch<null>(`/projects/${projectId}/tasks/${taskId}/nudge`, {
    method: "POST",
    body: JSON.stringify({ kind }),
  });
}
