import type { Meeting, GenTodo } from "../types/meeting";

export const MEETINGS: Meeting[] = [
  {
    id: "m1", title: "6차 정기 회의 — 중간 통합 점검", date: "2024.12.10", duration: "1시간 23분", status: "processed",
    summary: "결제 시스템 연동 지연 이슈와 AI 예측 모델 성능 검증 방안을 논의했습니다. 발표 자료 분량과 데모 시나리오 초안도 공유되었습니다.",
    decisions: ["카카오페이 대신 토스페이먼츠 SDK로 교체", "AI 모델 정확도 목표를 85% 이상으로 설정", "12월 28일 최종 발표 리허설 진행"],
    todos: ["최동혁: 토스페이먼츠 SDK 연동 완료 (12.18)", "김민준: AI 모델 정확도 검증 보고서 작성 (12.20)", "이서연: 발표 자료 목차 초안 작성 (12.14)"],
    risks: ["결제 연동 일정 지연으로 QA 시간 부족 가능성", "AI 모델 학습 데이터 부족 우려"],
  },
  {
    id: "m2", title: "5차 정기 회의 — API 통합 리뷰", date: "2024.12.03", duration: "58분", status: "processed",
    summary: "백엔드 API 통합 현황을 검토하고 프론트엔드 연동 이슈를 해결했습니다. 센서 모듈 실데이터 수집도 시작되었습니다.",
    decisions: ["API 응답 스키마 공통 규격 확정", "센서 데이터 폴링 주기 5초로 결정"],
    todos: ["박지수: 공통 API 응답 모델 적용 (12.06)", "이서연: 모바일 화면 UI 피드백 반영 (12.08)"],
    risks: ["센서 데이터 오류율 3% 초과 시 대안 필요"],
  },
  { id: "m3", title: "4차 정기 회의 — 기능 범위 확정", date: "2024.11.26", duration: "1시간 05분", status: "processed" },
  { id: "m4", title: "3차 정기 회의 — 아키텍처 설계", date: "2024.11.19", duration: "1시간 40분", status: "processed" },
  { id: "m5", title: "7차 회의 예정", date: "2024.12.17", duration: "—", status: "pending" },
];

export const ANALYZE_STAGES = [
  "파일 업로드 완료", "텍스트 추출 중", "음성 변환 중",
  "회의 내용 분석 중", "핵심 결정사항 추출 중",
  "업무 자동 생성 중", "역할 분배 생성 중",
];

export const GEN_TODOS: GenTodo[] = [
  { id:"GT-01", title:"axios 인터셉터로 결제 SDK 교체",    desc:"토스페이먼츠 SDK fetch 충돌 이슈 해결 및 PR 재요청",    category:"backend",      assignee:"4", dueDate:"12.18", priority:"high",   basis:"블로커 TF-14 논의",        assigned:true },
  { id:"GT-02", title:"AI 모델 추가 학습 (목표 90%)",       desc:"현재 87% → 목표 90% 정확도 달성 후 검증 보고서 작성",   category:"ai-ml",        assignee:"1", dueDate:"12.20", priority:"high",   basis:"AI 정확도 목표 상향 결정",  assigned:true },
  { id:"GT-03", title:"최종 발표 대본 초안 작성",            desc:"12.28 리허설 전 대본 완성 및 팀 내 공유",              category:"presentation", assignee:"",  dueDate:"12.25", priority:"medium", basis:"발표 리허설 일정 논의",     assigned:false },
  { id:"GT-04", title:"QA 테스트 일정 재조정",              desc:"결제 연동 완료 후 부하 테스트 일정 업데이트",            category:"qa",           assignee:"",  dueDate:"12.22", priority:"medium", basis:"일정 위험 요소 논의",       assigned:false },
  { id:"GT-05", title:"README 및 배포 가이드 작성",          desc:"실행 방법, 환경 변수, API 명세 포함 문서화",             category:"docs",         assignee:"3", dueDate:"12.25", priority:"low",    basis:"산출물 체크리스트 논의",    assigned:true },
];

export const MOCK_SUMMARY = "토스페이먼츠 SDK 충돌 이슈가 최우선 블로커로 논의되었고, axios 인터셉터 방식으로 교체하기로 결정했습니다. AI 예측 모델 정확도 목표를 87%에서 90%로 상향 조정하였으며, 12월 28일 최종 발표 리허설 2시간 진행이 확정되었습니다.";

export const MOCK_DECISIONS = [
  "토스페이먼츠 SDK를 axios 인터셉터 방식으로 교체 — 최동혁 담당, 기한 12.18",
  "AI 모델 정확도 목표 90% 이상으로 상향 — 김민준 담당, 기한 12.20",
  "12월 28일 오후 2시 최종 발표 리허설 2시간 진행 확정",
  "QA 테스트 범위를 핵심 시나리오 3개로 우선 축소 진행",
];

export const MOCK_RISKS = [
  { level:"high",   text:"결제 연동 지연으로 QA 일정 부족 가능성", suggestion:"QA 범위를 핵심 시나리오 중심으로 우선 축소 검토" },
  { level:"medium", text:"AI 모델 학습 데이터 부족 우려 (현재 87%)", suggestion:"공개 주차 데이터셋 추가 수집 또는 목표치 하향 검토" },
];
