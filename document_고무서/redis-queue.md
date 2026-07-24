# Redis Queue 작업 인수인계

작성일: 2026-07-23 · 브랜치: `feature/redis-queue` · **dev·main 모두 머지 완료**

다음 세션에서 이 작업을 이어받을 때 필요한 것만 정리했다. 설계 배경 전체는
[2026-07-23-redis-queue-and-caching-design.md](2026-07-23-redis-queue-and-caching-design.md),
RAG 답변 생성 흐름은 [2026-07-23-rag-assistant-answer-flow.md](2026-07-23-rag-assistant-answer-flow.md) 참고.

---

## 1. 지금 어디까지 됐나

| PR | 내용 | 상태 |
|---|---|---|
| #225 | 회의록 분석 Redis Stream 큐 + RAG/분석 캐시 + OCI Redis 보호 조치 | MERGED (07-23 07:49) |
| #241 | 위 브랜치의 후속 커밋 | MERGED (07-23 09:42) |

핵심 커밋 3개는 **dev·main 모두에 포함**되어 있다.

| 커밋 | 내용 |
|---|---|
| `8eee073` | 배포 리뷰 지적 3건 수정 + 설계 문서 정정 |
| `faf35ed` | 개인화 RAG 질문이 '근거 없음'으로 답하던 문제 수정 |
| `4289d4d` | RAG 답변 캐시 스키마 v1 → v2 |

### 선행 작업 완료 여부

| 항목 | 상태 |
|---|---|
| 마이그레이션 009 (`rag_assignee_sync_failures`) | Supabase 적용 확인 |
| 마이그레이션 010 (`meetings.analysis_job_id`) | Supabase 적용 확인 |
| 서버 `App/.env` Redis ACL 비밀번호 3개 | 추가 완료 (48자, 상호 상이) |

**배포 차단 요소 없음.**

---

## 2. 이번에 고친 실제 결함 2건

### 2-1. 개인화 질문에서 담당 업무를 '근거 없음'으로 답하던 문제

증상: "내 업무 알려줘" → 출처 5건이 붙어 있는데도 답변은 `근거 없음: 관련 자료를 찾지 못했습니다`.
담당 청크를 41개 가진 사용자에서도 재현.

원인은 검색이 아니라 **프롬프트 구성**이었다. `retrieval_service`는 `assignee_id`로 필터링해
질문자 담당 청크만 넘기는데, 청크 본문은 업무 제목뿐이라 담당자가 드러나지 않는다.
이 필터링 사실이 생성 단계에 전달되지 않아, 모델은 "질문자 본인 것인지 알 수 없다"고 보고
시스템 프롬프트 규칙(`컨텍스트에 관련 내용이 없으면 '근거 없음'`)을 그대로 따랐다.

수정: `generate_answer(question, sources, is_personal)` 추가. 개인화 질문일 때만 컨텍스트
**앞에** 안내문을 붙인다.

```python
# generation_service.py
_PERSONAL_CONTEXT_NOTICE = "아래 자료는 모두 질문자 본인이 담당자로 지정된 항목입니다."

if is_personal and sources:
    context = f"{_PERSONAL_CONTEXT_NOTICE}\n\n{context}"
```

건드릴 때 지켜야 할 두 가지:

- **안내문은 반드시 컨텍스트 앞.** 청크 본문은 사용자가 입력한 회의록·업무 제목이라 신뢰할 수
  없는 데이터다. 안내문이 뒤에 오면 청크에 심어둔 문구로 안내문을 무효화할 수 있다.
  `test_generation_service.py`가 `prompt.index()`로 순서를 직접 검증한다.
- **`sources`가 비면 안내문을 붙이지 않는다.** "본인 담당 항목입니다" 뒤에 "(관련 자료 없음)"이
  오면 모델이 없는 업무를 지어낼 수 있다. 담당 업무 0건이면 '근거 없음'이 맞는 답이다.

캐시 키는 손대지 않았다. `assignee_id`가 이미 키에 들어 있어(`rag_answer:1:3:<digest>`)
개인화 여부가 자동으로 분리된다.

### 2-2. 프롬프트를 바꿔도 낡은 답변이 30분 나가던 문제

`rag_epoch:{project_id}` INCR는 **프로젝트 데이터가 바뀔 때만** 올라간다. 코드·프롬프트만
바뀐 배포에서는 epoch가 그대로라 캐시 키도 같고, 이전 프롬프트로 만든 답변이 TTL 30분 동안
계속 반환된다.

`_ANSWER_CACHE_SCHEMA_VERSION`을 `v2`로 올려 해결. 이 값은 캐시 키 해시에 들어가므로
한 번 올리면 전체 무효화된다.

> **다음에 프롬프트를 수정하면 이 상수를 또 올려야 한다.** 응답 스키마 변경 전용이 아니다.
> 상수 위 주석에 사유를 남겨뒀다.

단, 버전 상승은 **기존 키를 삭제하지 않는다.** 고아 상태로 두고 TTL로 자연 만료시킨다.
배포 직후 두 세대 키가 잠시 공존하지만 조회는 새 키로만 간다.

---

## 3. 검증 방법 (로컬)

```bash
cd App
docker compose build backend-fastapi && docker compose up -d backend-fastapi
until curl -sf -o /dev/null http://localhost:8000/docs; do sleep 3; done
```

FastAPI 직접 호출:

```bash
KEY=$(grep '^RAG_INTERNAL_API_KEY=' App/.env | cut -d= -f2-)
curl -s -X POST http://localhost:8000/ai/rag/query \
  -H "Content-Type: application/json" -H "X-Internal-Api-Key: $KEY" \
  -d '{"project_id":1,"question":"내 업무 알려줘","user_id":3}'
```

Spring 경유 (프론트가 실제로 쓰는 경로):

```bash
TOK=$(curl -s http://localhost:8080/api/v1/auth/dev-login-token/3 | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])")
curl -s -X POST http://localhost:8080/api/v1/ai/rag/query \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"project_id":1,"question":"내 업무 알려줘"}'
```

`user_id`를 안 보내도 담당 업무가 나와야 한다. Spring이 `CurrentUser.id()`로 채운다
(`RagController.java:41-44`). 이게 개인화 인증의 핵심이라 회귀 시 반드시 확인할 것.

검증에 쓴 데이터: `project_id=1`, `user_id=3` (담당 청크 41개). 참고로
`document_chunks` 총 138개, `project_id=1`에 대부분 몰려 있다.

회귀 확인 3종:

| 시나리오 | 기대 결과 |
|---|---|
| 담당 업무 0건 사용자 (`user_id=999`) | `근거 없음`, sources 0 — 지어내면 안 됨 |
| 비개인화 질문 | 출처 기반 서술 답변, meeting 청크 혼합 |
| 같은 질문 2회 | 2회차 0.05초 이내 (캐시 히트) |

단위 테스트:

```bash
cd App/backend_fastapi
.venv/bin/python -m pytest tests/llm_rag_assistant/ tests/test_cache.py -q   # 111 passed
```

---

## 4. 반복해서 걸린 함정

**이미지를 재빌드해도 Redis 캐시가 낡은 답변을 그대로 준다.** 프롬프트를 고쳐놓고
"안 고쳐졌다"고 오판하기 쉽다. 검증 전 캐시를 비울 것.

```bash
docker exec workflow-redis redis-cli --scan --pattern 'rag_answer:*' \
  | xargs -r docker exec workflow-redis redis-cli del
```

**로컬 컨테이너가 운영 Supabase를 본다.** FastAPI·Spring 둘 다 `.env`의
`DATABASE_URL` / `SPRING_DATASOURCE_URL`이 Supabase를 가리킨다. 로컬 Postgres 컨테이너는
이관 대비용으로 띄워만 뒀고 테이블이 없다. **조회는 안전하지만 로컬에서 회의록 등록·업무
수정 같은 쓰기를 하면 운영 데이터가 바뀐다.**

**로컬 `.env`의 Redis ACL 비밀번호가 운영과 동일하다.** 로컬에서 prod 오버레이를 띄우면
운영과 같은 자격증명이 만들어진다. `REDIS_URL`이 로컬을 가리키는지 확인하고 쓸 것.

**`.env` 백업본은 `.env` 패턴에 안 걸린다.** `.gitignore`의 `.env` 한 줄만으로는
`App/.env.bak-20260723-164641` 같은 파일이 `git add -A`에 그대로 딸려 들어간다.
백업본에도 `DATABASE_URL`·`HF_TOKEN`·`RAG_INTERNAL_API_KEY` 등 같은 시크릿이 들어 있다.
`.env.bak*` / `.env.*.bak` 패턴을 추가해 막았다(`.gitignore:157-158`). 백업 파일도 삭제했다.
앞으로 `.env`를 백업할 때 이 두 패턴에 맞는 이름을 쓸 것.

**`set -e` 셸 스크립트에서 `head -c`로 난수를 자르면 SIGPIPE로 스크립트가 죽는다.**
`tr -dc ... < /dev/urandom | head -c 48`이 pipefail과 만나면 조용히 중단된다.
`openssl rand -base64 96 | tr -d '\n=' | tr '+/' '_-' | cut -c1-48`를 쓸 것 (cut은 입력을 다 읽어 SIGPIPE가 안 난다).

---

## 5. 남은 일

- [x] `.env` 백업본 유출 경로 차단 — `.gitignore`에 `.env.bak*` / `.env.*.bak` 추가, 백업 파일 삭제
- [ ] `RAG_INTERNAL_API_KEY`, `LANGSMITH_API_KEY` 로테이션 — 대화 기록에 평문 노출됨
- [ ] 마이그레이션 경로 일원화 — `docs/db/migrations/`와 `supabase/migrations/`에 중복돼 있고
      어느 쪽도 자동 실행되지 않는다 (Flyway 비활성 상태)
- [ ] 프론트엔드 화면(`localhost:5173`) 실사용 확인 — API 레벨까지만 검증함
- [ ] PR #172 (`chore/deploy-docker-cache-cleanup` → dev) 미머지 상태로 남아 있음

### 판단이 필요한 열린 항목

RAG epoch 갱신 실패 시 정책. 현재 `advance_rag_project_epoch`는 예외를 **삼킨다**(fail-open).
DB 커밋 뒤 호출이라 예외를 던지면 "DB엔 반영됐는데 API는 실패"인 부분 성공이 되고 재시도 시
중복 적재되기 때문이다. 대가로 무효화 실패 시 삭제·권한 변경 전 답변이 최대 30분 노출된다.

리뷰마다 정반대를 요구해 왔다. 노출 창을 줄이려면 두 가지 선택지가 있다.

1. 삭제·권한 변경 경로만 TTL을 짧게 (예: 60초)
2. epoch 갱신 실패를 outbox(`rag_assignee_sync_failures`)에 넣어 재시도

아직 결정 안 됨.
