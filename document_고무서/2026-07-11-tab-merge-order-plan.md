# 탭별 병합 순서 및 담당자 계획

작성일: 2026-07-11

## 배경

대시보드, 업무보드, 회의록 AI, 산출물 생성, GitHub 연동 5개 탭을 병렬로 개발 후 병합 예정.
프론트엔드는 기능별 폴더로 분리되어 있으나(`board/`, `dashboard/`, `meetings/`, `deliverables/`, `github/`),
아래 두 지점은 모든 브랜치가 공통으로 건드려 충돌이 발생하기 쉽다.

- `App/frontend/src/global/lib/constants/nav.ts` (탭 목록)
- `App/frontend/src/routes/router.tsx` (라우트 등록)

또한 실제 코드 의존성 조사 결과, `board`가 `dashboard`/`meetings`의 기반 모듈(타입, mock, `taskService`, `localStore` 등)을 제공하고 있어 병합 순서에 반드시 반영해야 한다.

## 의존성 조사 결과

| 탭 | 다른 탭에 대한 의존 |
|---|---|
| 업무보드 (board) | 없음 (독립) |
| GitHub 연동 (github) | 없음 (독립) |
| 산출물 생성 (deliverables) | 없음 (독립, 현재 전부 mock 데이터) |
| 회의록 AI (meetings) | `board`의 타입/유틸/컴포넌트 (`CatTag`, `PriorityBadge`, `taskService`, `localStore` 등) |
| 대시보드 (dashboard) | `board`의 타입/유틸, `github`의 mock 데이터 |

## 병합 순서

| 순서 | 탭 (브랜치) | 담당자 | 사유 |
|---|---|---|---|
| 1 | 업무보드 | TODO | 다른 탭들이 참조하는 기반 타입/유틸 제공. 가장 먼저 들어가야 이후 브랜치들의 import가 깨지지 않음 |
| 2 | GitHub 연동 | TODO | 의존성 없는 독립 모듈. 리스크 낮아 `nav.ts`/`router.tsx` 충돌을 일찍 해소 |
| 3 | 산출물 생성 | TODO | 의존성 없는 독립 모듈 (mock 기반) |
| 4 | 회의록 AI | TODO | `board` 병합 이후 진행 가능 |
| 5 | 대시보드 | TODO | `board`와 `github` 양쪽에 의존하므로 마지막. 다른 탭 mock 구조 변경 시 가장 크게 영향받음 |

## 병합 진행 규칙

1. 각 브랜치는 자기 기능 폴더(`src/<feature>/`) 안에서만 로직을 완결한다.
2. `nav.ts`/`router.tsx`에 탭을 추가하는 변경은 최소 1~2줄로 유지한다 (append 방식).
3. 한 브랜치가 병합되면, 나머지 대기 중인 브랜치는 즉시 main을 rebase하고 아래를 확인한다.
   - `nav.ts`/`router.tsx` 충돌 여부
   - 다른 기능 폴더 import 경로가 깨지지 않았는지 (특히 `board` 병합 후 `meetings`/`dashboard`)
4. `package.json` / `pnpm-lock.yaml` 변경(의존성 추가)은 병합 시점에 재설치 후 `pnpm dev`로 기동 확인한다.

## TODO

- [ ] 각 탭 담당자 배정
- [ ] 예상 병합 일정(날짜) 채우기
