export const BLOCKER_DETAILS = [
  {
    id: "BL-01", taskId: "TF-13",
    title: "DB 인덱싱 최적화 — MySQL 복합 인덱스 의사결정 미결",
    type: "결정 필요", severity: "high" as const,
    reason: "EXPLAIN 분석 결과 복합 인덱스 설계 방향에 팀 내 합의가 없어 주요 조회 쿼리 전체의 풀스캔이 지속되고 있음.",
    assignee: "1", resolver: null as string | null,
    affectedTaskIds: ["TF-05", "TF-14"], daysSince: 4, createdAt: "12.06",
    aiSuggestion: "EXPLAIN 결과를 공유 채널에 올리고 오늘 내 30분 결정 미팅을 잡는 것을 추천합니다. 단기 조치로 단일 컬럼 인덱스를 먼저 적용하세요.",
    link: "5차 정기 회의",
  },
  {
    id: "BL-02", taskId: "TF-14",
    title: "결제 오류 예외 처리 — 토스페이먼츠 SDK fetch 인터셉터 충돌",
    type: "기술 문제", severity: "high" as const,
    reason: "토스페이먼츠 SDK v2.3 내부 fetch 인터셉터가 기존 전역 fetch와 충돌하여 에러 코드 응답 파싱이 불가능. PR #18 머지가 블로킹 중.",
    assignee: "4", resolver: "1",
    affectedTaskIds: ["TF-05"], daysSince: 3, createdAt: "12.07",
    aiSuggestion: "axios 인터셉터로 교체하거나 SDK 응답 래퍼 함수를 도입하세요. 토스페이먼츠 공식 이슈 #234에 동일 사례가 있습니다.",
    link: "PR #18",
  },
];
