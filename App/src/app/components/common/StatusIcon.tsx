import { CheckCircle2, Clock, AlertTriangle, Circle } from "lucide-react";
import type { TaskStatus } from "../../models/task";

export function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "done") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === "inprogress") return <Clock className="w-4 h-4 text-blue-500" />;
  if (status === "blocked") return <AlertTriangle className="w-4 h-4 text-red-500" />;
  return <Circle className="w-4 h-4 text-slate-300" />;
}
