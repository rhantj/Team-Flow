import type { GitRecord } from "../models/github";

export const GITHUB: GitRecord[] = [
  { type: "pr", message: "feat: 토스페이먼츠 SDK 연동 초안 (#18)", author: "최동혁", time: "1시간 전" },
  { type: "commit", message: "fix: 주차 공간 상태 실시간 업데이트 버그 수정", author: "김민준", time: "3시간 전" },
  { type: "commit", message: "feat: 관리자 통계 차트 컴포넌트 추가", author: "이서연", time: "5시간 전" },
  { type: "merge", message: "Merge PR #17: 모바일 예약 화면 완성", author: "김민준", time: "어제" },
  { type: "commit", message: "feat: AI 예측 모델 데이터 전처리 파이프라인", author: "김민준", time: "어제" },
  { type: "pr", message: "feat: 사용자 알림 서비스 기본 구조 (#19)", author: "최동혁", time: "2일 전" },
];
