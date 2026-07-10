# App 디렉토리 MVC 구조화 리팩터링 — 위험도(High) 리뷰 대응

- 관련 커밋: `d144ed6` (refactor: App 디렉토리 MVC 구조화 및 react-router 도입)
- 계획 문서: `~/.claude/plans/app-async-otter.md`

## 리뷰에서 제기된 우려

> App.tsx가 4727줄에서 11줄로 축소되어 기존 대시보드, 보드, 회의록 AI, GitHub 연동, 마이페이지 lazy 로딩 등 대부분의 UI/상태/데모 로직이 삭제되었습니다. README, ATTRIBUTIONS, shadcn 테마 CSS, 가이드 문서도 함께 삭제되어 문서·라이선스·디자인 토큰 손실이 있습니다. 의도적 전면 교체가 아니라면 기능 대량 회귀 및 빌드/런타임 오류 가능성이 매우 높고, 파괴적 변경으로 판단됩니다.

## 대응 근거

### 1. App.tsx 축소는 삭제가 아니라 이동

`d144ed6` diff 통계: `+5417 / -5160` — 삭제보다 추가가 많음. 4727줄의 로직은 사라진 것이 아니라 `models/`, `data/`, `services/`, `pages/`, `components/`, `hooks/`, `routes/` 아래 70여 개 신규 파일로 분리 이동됨.

### 2. 주요 기능 전부 보존

| 기존 기능 | 이동 위치 |
|---|---|
| 대시보드 | `App/src/app/pages/dashboard/DashboardView.tsx` + 상세페이지 8개 (`pages/dashboard/detail/*`) |
| 업무 보드 | `App/src/app/pages/board/BoardView.tsx` |
| 회의록 AI | `App/src/app/pages/meetings/MeetingsView.tsx` |
| GitHub 연동 | `App/src/app/pages/github/GithubView.tsx` |
| 마이페이지 lazy 로딩 | `App/src/app/pages/mypage/MyPageRoute.tsx` — `React.lazy(() => import("./MyPage"))` 그대로 유지 |
| AI 어시스턴트 | `App/src/app/pages/ai/AIAssistant.tsx` |

### 3. 실행 검증

- `pnpm build` 정상 통과 (esbuild 트랜스폼 에러 없음)
- Playwright 헤드리스 브라우저로 전체 플로우 스모크 테스트 수행:
  로그인 → 대시보드 → 상세페이지 진입/뒤로가기 → 사이드바 전 탭 전환(보드/회의록AI/마이페이지) → AI 패널 열기 → 새로고침 시 `/login` 복귀(의도된 동작)
- 콘솔 에러 0건, 각 화면 스크린샷으로 렌더링 확인 완료

### 4. 문서/CSS 삭제는 미사용 확인 후 사용자 승인 받은 삭제

- `default_shadcn_theme.css`: `main.tsx`, `index.html` 어디서도 import된 적 없는 Figma Make 잔재 파일. 실제 사용 중인 디자인 토큰은 `App/src/styles/theme.css`, `index.css`이며 이번 작업에서 변경하지 않음 — 디자인 토큰 손실 없음.
- `README.md`, `ATTRIBUTIONS.md`, `guidelines/Guidelines.md`: 코드 전체 grep으로 참조 0건 확인. 삭제 전 사용자에게 AskUserQuestion으로 명시적 확인 받음.

## 결론

이번 변경은 우발적 삭제가 아닌 사용자 승인 하에 진행된 의도적 구조 리팩터링이며, 빌드·런타임·주요 기능 흐름이 실제 브라우저 테스트로 검증되었다.
