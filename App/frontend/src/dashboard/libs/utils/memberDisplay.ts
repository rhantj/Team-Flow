import { MEMBERS } from "../../../global/lib/mock/members";
import type { Member } from "../../../global/lib/types/member";

const FALLBACK_COLORS = ["#3B5BDB", "#7048E8", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"];

/**
 * 서버가 내려주는 담당자 이름(assigneeName)을 화면 표시용 Member로 변환한다.
 * 데모 시드 팀원(김민준/이서연/박지수/최동혁)이면 MEMBERS mock의 고정 색상/이니셜을 쓰고,
 * 그 외 이름(실제 가입한 사용자 등)은 이름에서 이니셜을 뽑고 색상은 팔레트를 순환시켜 만든다.
 */
export function resolveMemberDisplay(name: string | null | undefined, indexForColor: number): Member {
  const known = MEMBERS.find(m => m.name === name);
  if (known) return known;

  const displayName = name ?? "미배정";
  return {
    id: displayName,
    name: displayName,
    initials: displayName.slice(0, 1),
    color: FALLBACK_COLORS[indexForColor % FALLBACK_COLORS.length],
    role: "팀원",
  };
}
