import type { TaskStatus } from "../../../board/libs/types/task";

export const MILESTONES = [
  { id: "M1", name: "요구사항 분석 완료",  date: "11.10", status: "done"       as TaskStatus, tasks: 3, progress: 100 },
  { id: "M2", name: "시스템 설계 완료",    date: "11.20", status: "done"       as TaskStatus, tasks: 5, progress: 100 },
  { id: "M3", name: "핵심 기능 개발",      date: "12.10", status: "inprogress" as TaskStatus, tasks: 6, progress: 58  },
  { id: "M4", name: "통합 테스트",         date: "12.20", status: "todo"       as TaskStatus, tasks: 4, progress: 10  },
  { id: "M5", name: "최종 발표 준비",      date: "12.25", status: "todo"       as TaskStatus, tasks: 3, progress: 0   },
  { id: "M6", name: "최종 제출",           date: "12.28", status: "todo"       as TaskStatus, tasks: 2, progress: 0   },
];
