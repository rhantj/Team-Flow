export interface Deliverable { id: string; type: string; title: string; status: "ready" | "draft" | "pending"; updatedAt: string; }

export type DelivStatus = "pending" | "draft" | "editing" | "done";
export interface DelivCard {
  id: string; type: string; title: string; status: DelivStatus;
  updatedAt: string; author: string; linkedTasks: number; fileType?: string; version?: string;
}
