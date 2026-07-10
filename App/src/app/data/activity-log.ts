import type { Activity } from "../models/activity";

export const ACTIVITY_LOG: Activity[] = [
  { id: 1,  type: "pr",          actor: "최동혁", time: "방금 전",   message: "PR #18 생성: 토스페이먼츠 SDK 연동 초안",          target: "TF-05" },
  { id: 2,  type: "task_update", actor: "김민준", time: "1시간 전",  message: "AI 빈자리 예측 모델 학습을 '진행 중'으로 변경",      target: "TF-06" },
  { id: 3,  type: "meeting",     actor: "이서연", time: "3시간 전",  message: "6차 정기 회의 회의록 업로드",                       target: "M-06" },
  { id: 4,  type: "ai",          actor: "AI",     time: "3시간 전",  message: "6차 정기 회의 AI 요약 및 To-Do 자동 생성 완료",      target: "M-06" },
  { id: 5,  type: "commit",      actor: "김민준", time: "5시간 전",  message: "fix: 주차 공간 상태 실시간 업데이트 버그 수정",       target: "TF-01" },
  { id: 6,  type: "commit",      actor: "이서연", time: "5시간 전",  message: "feat: 관리자 통계 차트 컴포넌트 추가",               target: "TF-07" },
  { id: 7,  type: "pr",          actor: "최동혁", time: "6시간 전",  message: "PR #19 생성: 사용자 알림 서비스 기본 구조",          target: "TF-08" },
  { id: 8,  type: "deliverable", actor: "김민준", time: "어제",      message: "중간 진행 보고서 초안 AI 생성 완료",                 target: "보고서" },
  { id: 9,  type: "merge",       actor: "김민준", time: "어제",      message: "PR #17 머지: 모바일 예약 화면 UI 완성",              target: "TF-04" },
  { id: 10, type: "task_create", actor: "AI",     time: "어제",      message: "회의록 AI가 업무 3개 자동 생성 — 팀장 승인 대기",    target: "회의록 AI" },
  { id: 11, type: "comment",     actor: "박지수", time: "어제",      message: "TF-11: README 작성 방향에 대한 코멘트 남김",          target: "TF-11" },
  { id: 12, type: "commit",      actor: "김민준", time: "2일 전",    message: "feat: AI 예측 모델 데이터 전처리 파이프라인 구현",    target: "TF-06" },
  { id: 13, type: "task_update", actor: "박지수", time: "2일 전",    message: "실시간 주차 현황 대시보드 UI 완료 처리",             target: "TF-03" },
  { id: 14, type: "file",        actor: "이서연", time: "2일 전",    message: "발표자료 초안 PPT 파일 업로드",                      target: "발표자료" },
  { id: 15, type: "task_update", actor: "박지수", time: "2일 전",    message: "사용자 인증 API 구현 완료 처리",                     target: "TF-02" },
  { id: 16, type: "meeting",     actor: "김민준", time: "4일 전",    message: "5차 정기 회의 회의록 업로드",                        target: "M-05" },
  { id: 17, type: "ai",          actor: "AI",     time: "4일 전",    message: "5차 정기 회의 AI 분석 완료 — 리스크 2건 감지",       target: "M-05" },
  { id: 18, type: "commit",      actor: "최동혁", time: "4일 전",    message: "feat: 결제 연동 기본 흐름 구현",                     target: "TF-05" },
];
