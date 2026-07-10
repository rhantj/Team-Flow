import type { Priority } from "./task";

export interface Meeting {
  id: string; title: string; date: string; duration: string; status: "processed" | "processing" | "pending";
  summary?: string; decisions?: string[]; todos?: string[]; risks?: string[];
}

export type UploadFlow = null | "modal" | "analyzing" | "results" | "review" | "done";
export type UploadType = null | "document" | "audio" | "video";

export interface GenTodo {
  id: string; title: string; desc: string; category: string;
  assignee: string; dueDate: string; priority: Priority; basis: string; assigned: boolean;
}
