export interface GitRecord { type: "commit" | "pr" | "merge"; message: string; author: string; time: string; }
