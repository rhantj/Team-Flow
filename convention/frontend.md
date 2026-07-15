# Frontend 개발 컨벤션 (WorkFlow AI)

React 19 + Vite 7 + TypeScript 5.9 + Tailwind CSS 4 기반 프론트엔드.

## 기술 스택 (고정 버전)

| 기술 | 버전 | 주의 |
| --- | --- | --- |
| Node.js | 24.x LTS (`.nvmrc`) | Vite 7이 Node 20+ 요구 |
| React | 19.2 | `@types/react` 19와 매칭 |
| Vite | 7.3 | dev/build 도구 |
| TypeScript | 5.9 | strict 모드 유지 |
| Tailwind CSS | 4.3 | **v4** — `@import 'tailwindcss'`, `@tailwindcss/vite` 플러그인. v3 설정(`tailwind.config.js`) 쓰지 말 것 |

설치·실행: `cd App/frontend && npm install && npm run dev`

## 폴더 구조 (기능별 세로 분리)

파일 타입이 아니라 **기능(도메인) 단위**로 묶는다. 기존 구조를 따른다.

```
src/
├── auth/          # 인증/로그인 (FS-1)
├── board/         # 업무 보드 (FS-6)
├── dashboard/     # 대시보드 (FS-3)
├── meetings/      # 회의록 (FS-2)
├── ai/            # AI Assistant (FS-4)
├── contributors/  # 기여도 (FS-7)
├── mypage/        # 마이페이지
├── routes/        # router.tsx (라우팅 집중)
└── global/        # 공유: component, hooks, lib, styles
```

각 기능 폴더 하위 규칙:
- `screen/` — 라우트에 연결되는 페이지 컴포넌트
- `components/` — 해당 기능 전용 하위 컴포넌트
- `libs/` — 해당 기능 전용 API 호출·훅·유틸

공유 자원은 반드시 `global/`에. 기능 폴더 간 직접 import 금지(순환 의존 방지) — 공유가 필요하면 `global/`로 올린다.

## 네이밍

- 컴포넌트/타입: `PascalCase` (`TaskBoard`, `MeetingCard`)
- 훅: `use` 접두사 camelCase (`useProjectQuery`)
- 변수/함수: `camelCase`, boolean은 `is/has/should/can` 접두사
- 상수: `UPPER_SNAKE_CASE`
- 파일: 컴포넌트는 PascalCase.tsx, 그 외 camelCase.ts
- CSS 클래스: kebab-case (Tailwind 유틸 우선)

## 상태 관리

| 종류 | 도구 |
| --- | --- |
| 서버 상태 | TanStack Query (캐시·revalidate) |
| 클라이언트 상태 | 최소화, 필요 시 Zustand |
| URL 상태 | search params (필터/정렬/탭/페이지) |
| 폼 상태 | React Hook Form |

- 서버 상태를 클라이언트 스토어에 복제하지 말 것. 파생값은 저장하지 말고 계산.
- 필터·정렬·활성 탭 등 공유 가능한 상태는 URL에 둔다.

## API 연동

- 백엔드 기본 경로: `/api/v1/...` (Spring), AI 기능은 Spring이 프록시하거나 문서 명세를 따른다.
- API 호출은 각 기능의 `libs/`에 모으고, 컴포넌트에서 직접 fetch 금지.
- 응답 envelope 일관 처리: `{ success, data, error }` 형태를 가정하고 error를 명시적으로 핸들링.
- 인증 토큰(JWT)은 인터셉터에서 주입. 401 시 로그인 리다이렉트.

## 스타일 / UI

- 디자인 토큰은 CSS 변수(`global/styles`)로 정의, 색·간격·타이포 하드코딩 반복 금지.
- 애니메이션은 `transform`/`opacity` 등 컴포지터 친화 속성만. `width/height/top/left`는 애니메이트 금지.
- 시맨틱 HTML 우선(`header/nav/main/section`), 의미 없는 `div` 남발 금지.
- 역할별(팀장/팀원/심사자) 화면 분기는 라우트 가드에서 처리.

## 코드 원칙

- 파일당 200~400줄 권장, 800줄 초과 금지 — 넘으면 분리.
- 불변성 유지: 객체·배열 직접 수정 금지, 새 객체 반환.
- 깊은 중첩(4단계 초과) 금지, early return 사용.
- 에러는 사용자 친화 메시지로 UI 노출, 콘솔 debug 로그는 커밋 금지.
- 요청 범위를 벗어난 리팩터링·추상화 금지 (YAGNI).

## 커밋 전 체크

- [ ] `npm run build` 통과 (타입 에러 0)
- [ ] lint 통과
- [ ] console.log/debugger 제거
- [ ] 하드코딩 값 없음(상수·env 사용)
- [ ] 역할별 접근 제어 확인
