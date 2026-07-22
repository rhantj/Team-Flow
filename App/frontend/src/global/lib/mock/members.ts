import type { Member } from "../types/member";

// 실제 프로젝트 멤버(userId)에 색상을 배정할 때 userId % length로 순환 사용한다.
export const PARTICIPANT_COLORS = ["#3B5BDB", "#7048E8", "#10B981", "#F59E0B", "#EC4899", "#0EA5E9"];

export const MEMBERS: Member[] = [
  { id: "1", name: "김민준", initials: "김", color: "#3B5BDB", role: "팀장" },
  { id: "2", name: "이서연", initials: "이", color: "#7048E8", role: "팀원" },
  { id: "3", name: "박지수", initials: "박", color: "#10B981", role: "팀원" },
  { id: "4", name: "최동혁", initials: "최", color: "#F59E0B", role: "팀원" },
];
