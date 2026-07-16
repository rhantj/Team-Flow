import type { Priority, Task, TaskStatus } from "../types/task";
import { apiFetch } from "../../../global/api/apiClient";

// TODO: 실제 인증/프로젝트 선택 기능이 붙기 전까지 쓰는 임시 프로젝트 id.
// 백엔드 DemoDataService가 "demo-project"를 데모 프로젝트 DB row로 변환해준다.
export const DEMO_PROJECT_ID = "demo-project";

interface TaskListItemDto {
  id: string;
  title: string;
  category: string | null;
  status: string;
  assigneeId: string | null;
  dueDate: string | null;
  priority: string | null;
  position: number;
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
  };
}

export async function fetchTasks(projectId: string = DEMO_PROJECT_ID): Promise<Task[]> {
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

export async function createTask(input: CreateTaskInput, projectId: string = DEMO_PROJECT_ID): Promise<Task> {
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
  projectId: string = DEMO_PROJECT_ID
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

export async function updateTask(taskId: string, input: UpdateTaskInput, projectId: string = DEMO_PROJECT_ID): Promise<Task> {
  const dto = await apiFetch<TaskListItemDto>(`/projects/${projectId}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return toTask(dto);
}

export async function deleteTask(taskId: string, projectId: string = DEMO_PROJECT_ID): Promise<void> {
  await apiFetch<null>(`/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
}
