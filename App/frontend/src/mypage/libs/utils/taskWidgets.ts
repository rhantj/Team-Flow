import type { Task } from "../../../board/libs/types/task";

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date): Date {
  const dayOfWeek = date.getDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function getDueToday(tasks: Task[], now: Date = new Date()): Task[] {
  const todayIso = toISODate(now);
  return tasks.filter((task) => task.dueDate === todayIso);
}

export function getDueThisWeek(tasks: Task[], now: Date = new Date()): Task[] {
  const monday = startOfWeek(now);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const startIso = toISODate(monday);
  const endIso = toISODate(sunday);
  return tasks.filter((task) => task.dueDate !== "" && task.dueDate >= startIso && task.dueDate <= endIso);
}
