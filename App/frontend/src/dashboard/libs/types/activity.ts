export type ActivityType = "commit" | "pr" | "merge" | "task_create" | "task_update" | "meeting" | "ai" | "deliverable" | "comment" | "file";
export interface Activity { id: number; type: ActivityType; actor: string; time: string; message: string; target: string; }
