import type { Priority, Task, TaskStatus } from "../types/task";

// TODO: 실제 인증/프로젝트 선택 기능이 붙기 전까지 쓰는 임시 프로젝트 id.
// 백엔드 DemoDataService가 "demo-project"를 데모 프로젝트 DB row로 변환해준다.
export const DEMO_PROJECT_ID = "demo-project";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string } | null;
}

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

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`업무 API 요청 실패: ${response.status}`);
  }
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!body.success) {
    throw new Error(body.error?.message ?? "업무 API 요청 실패");
  }
  return body.data;
}

export async function fetchTasks(projectId: string = DEMO_PROJECT_ID): Promise<Task[]> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/tasks`);
  const items = await unwrap<TaskListItemDto[]>(response);
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
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const dto = await unwrap<TaskListItemDto>(response);
  return toTask(dto);
}

export async function updateTaskPosition(
  taskId: string,
  status: TaskStatus,
  position: number,
  projectId: string = DEMO_PROJECT_ID
): Promise<Task> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/position`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, position }),
  });
  const dto = await unwrap<TaskListItemDto>(response);
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
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const dto = await unwrap<TaskListItemDto>(response);
  return toTask(dto);
}

export async function deleteTask(taskId: string, projectId: string = DEMO_PROJECT_ID): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
  await unwrap<null>(response);
}
