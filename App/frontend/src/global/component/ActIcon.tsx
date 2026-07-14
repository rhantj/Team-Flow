import {
  FileAudio, GitCommit, GitMerge, GitPullRequest, MessageSquare, FileText as FileTextIcon,
} from "lucide-react";

export function ActIcon({ type }: { type: string }) {
  const map: Record<string,{ Icon: any; color: string; bg: string }> = {
    commit: { Icon: GitCommit, color:"#6B7280", bg:"#F4F6FA" },
    pr: { Icon: GitPullRequest, color:"#3B5BDB", bg:"#EEF1FB" },
    merge: { Icon: GitMerge, color:"#10B981", bg:"#ECFDF5" },
    comment: { Icon: MessageSquare, color:"#8892A4", bg:"#F4F6FA" },
    meeting: { Icon: FileAudio, color:"#7048E8", bg:"rgba(112,72,232,0.1)" },
    file: { Icon: FileTextIcon, color:"#F59E0B", bg:"#FFFBEB" },
  };
  const { Icon, color, bg } = map[type] ?? map.comment;
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: bg }}>
      <Icon className="w-3.5 h-3.5" style={{ color }} />
    </div>
  );
}
