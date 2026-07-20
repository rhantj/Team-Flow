# FS-5 워크로드 스코어 — 실제 데이터 재검증

작성일: 2026-07-16
작성자: 이은주 (FS-5 ML/AI 모델링)
관련 노트북: `workload_score_experiment.ipynb` 7장

## 1. 목적

지금까지 `workload_model.py`의 MAD 기반 과부하/저활동 탐지는 **합성 데이터**로만 검증됐다.
로드맵 다음 단계인 "실제 Supabase 데이터 연결 후 재검증"을 진행하면서, 팀이 실제로 쓴
Jira 보드 export(`Jira01~03.csv`)와 실제 Supabase `tasks` 테이블 두 경로를 함께 확인했다.

## 2. 데이터 소스

| 소스 | 상태 | 비고 |
|---|---|---|
| Jira01/02/03.csv | ✅ 검증 완료 | 팀 실사용 Jira 보드 export 3개 스냅샷(07-14~07-15) |
| Supabase `tasks` | ✅ 연결·검증 완료 | project_id=1, 실제 배정 업무 17건, 팀원 4명 |

### 2-1. Supabase 연결 트러블슈팅 (다른 팀원도 겪을 수 있어서 기록)

처음엔 연결이 안 됐는데, 원인이 4단계로 겹쳐 있었다. 순서대로:

1. **`.env` 위치**: `App/backend_fastapi/.env`가 아니라 `App/.env`(docker-compose 공용 설정)에
   넣었었음. `workload_db.py`는 파일 자기 위치 기준 상위 디렉터리를 훑어 `.env`를 찾기 때문에
   `uvicorn`으로 실제 서비스를 띄울 땐 문제없지만, **Jupyter 커널에서는 `__main__`에 `__file__`이
   없어 항상 `os.getcwd()`(노트북 위치)부터 찾는다** — `document_이은주/`는 `App/`의 하위가 아니라서
   못 찾음. 노트북 7-2 셀에서 `BACKEND_FASTAPI_PATH`/`App/` 두 경로를 직접 시도하도록 고쳐서 해결.
2. **엉뚱한 변수명**: `App/.env.example`의 `SUPABASE_URL` 필드는 원래 REST API 주소용인데,
   Supabase 대시보드에서 복사한 Postgres 연결 문자열을 실수로 그 필드에 넣어서 실제로 읽히는
   `DATABASE_URL`은 여전히 docker-compose 로컬 기본값(`localhost:5432`)을 가리키고 있었음.
3. **Session pooler 세션 한도**: Session pooler(포트 5432)는 무료 티어 기준 동시 세션 15개
   제한이 있어 `EMAXCONNSESSION` 에러가 남. 짧게 한 번 조회하고 끝나는 노트북/배치성 작업에는
   세션을 계속 붙잡지 않는 **Transaction pooler(포트 6543)**가 적합해서 포트를 바꿔서 해결.
   겸사겸사 `workload_db.py`의 `get_engine()`도 `pool_size=1, max_overflow=0` + 사용 후
   `engine.dispose()`로 고쳐서, 매 호출마다 자체 커넥션 풀을 잔뜩 열어두던 것도 정리했다.
4. **비밀번호 URL 인코딩**: 비밀번호에 `%`, `/`, `[`, `]` 같은 URI 특수문자가 그대로 들어있으면
   연결 문자열 파싱이 깨진다 — `urllib.parse.quote()`로 인코딩해서 해결.

## 3. 결과 요약

| 데이터셋 | 팀원 수 | 사용된 방법 | 이상치 탐지 수 |
|---|---|---|---|
| 합성 데이터 (2장) | 7 | MAD (소규모 팀) | 1 |
| Jira01 (07-14 스냅샷) | 6 | MAD (소규모 팀) | 2 |
| Jira02 (07-15 스냅샷, 최다 업무) | 6 | MAD (소규모 팀) | 2 |
| Jira03 (07-15 스냅샷) | 6 | MAD (소규모 팀) | 2 |
| Supabase 실 데이터 (project_id=1) | 4 | MAD (소규모 팀) | 1 |

Jira 기반 세 스냅샷과 실제 Supabase 데이터 모두 파이프라인이 크래시 없이 끝까지 돌았다.

## 4. 주요 발견사항 (실제 데이터라서 드러난 것들)

### 4-1. `completion_rate` 분포가 편중되면 방향 태깅("과부하" vs "저활동")이 애매해짐
Jira 데이터는 프로젝트 초반이라 팀원 6명 중 4명의 `completion_rate`가 0.0(완료 업무 없음)이었다.
이 상태에서 업무량이 가장 많은 `박지수`(23건, 완료율 0.30)는 팀 평균 완료율이 이례적으로 낮게
잡히는 바람에 "과부하 의심"이 아니라 `"이상 패턴(방향 불명확)"`으로 태깅됐다. 합성 데이터는
`done_prob`을 0.25~0.8 사이로 고르게 분포시켜 만들었기 때문에 이 문제가 드러나지 않았다.
**시사점**: 프로젝트 초반(완료 업무가 거의 없는 시점)에는 `completion_rate` 기반 방향 판별이
불안정할 수 있음 — 서비스 운영 중 이 구간에서 방향 태깅 정확도를 별도로 관찰할 필요가 있다.

### 4-2. 담당자 식별자가 사람과 1:1이 아닐 수 있음
Jira `담당자` 필드에 `박지수`(전체 이름)와 `pj`(계정 핸들로 추정), `dldmswn0293`(이메일 접두사 —
Jira 표시 이름을 설정하지 않은 계정으로 추정)가 서로 다른 값으로 섞여 있었다. 만약 `pj`와 `박지수`가
실제로 동일 인물이라면, 이번 집계는 한 사람의 업무량을 두 "가상 인물"로 쪼갠 것이 된다.
**실제 서비스(Supabase `tasks.assignee_id`)는 `users.id`(bigint)를 쓰므로 이 문제는 구조적으로
발생하지 않는다** — 이건 Jira CSV를 프록시 데이터로 쓸 때만 생기는 한계이니, Jira 기반 결과를
해석할 때는 참고만 하고 실제 배포 판단 근거로 쓰지 않는다.

### 4-3. 담당자 미배정 업무는 조용히 제외됨
Jira02.csv는 원본 170행 중 97행만 담당자가 있고 73행은 미배정 백로그였다. `workload_db.py`의
`load_tasks_from_db()`가 이미 `WHERE assignee_id IS NOT NULL`로 동일하게 필터링하므로 이번 어댑터도
그 동작을 그대로 따랐다. 다만 미배정 백로그 비중이 크면(이번 경우 43%) "현재 배정된 업무" 기준
과부하 판단이 팀 전체 백로그 규모를 과소평가할 수 있다는 점은 인지하고 있어야 한다.

### 4-4. CATEGORY_WEIGHT / PRIORITY_WEIGHT가 실제 값과 100% 안 맞고 있었다 (실제 버그, 수정함)
Supabase 실 데이터로 확인한 실제 `category` 값은 `{QA, ai-ml, backend, devops, frontend, other}`,
`priority`는 `{HIGH, MEDIUM, high, medium}`(대소문자 혼재)였다. 이건 Jira와 달리 **추정이 아니라
실측치**인데, `workload_model.py`의 `CATEGORY_WEIGHT`(한글 18종)·`PRIORITY_WEIGHT`(낮음/중간/높음)
키와 하나도 일치하지 않았다. 즉 **서비스가 실제로 돌아가면 모든 업무의 난이도가 조용히
기본값(가중치 0 / 중간)으로 뭉개지고 있었다** — 대소문자까지 섞인 걸 보면 프런트에서 보내는
값(`high`/`medium`)과 별도 시딩 스크립트가 넣은 값(`HIGH`/`MEDIUM`, Jira 원본 케이싱 그대로
옮긴 것으로 추정)이 다른 경로로 들어와 있다는 뜻이라 데이터 입력 경로 자체도 하나로 통일돼
있지 않다.

원인을 추적해보니 실제 카테고리 값은 `App/frontend/src/board/libs/types/task.ts`의
`CatId`(영문 슬러그 18종)와 정확히 1:1 대응됐다(`planning→기획`, `ai-ml→AI/ML` 등). **FS-5가
기획 문서의 한글 라벨을 기준으로 모델을 만드는 동안 FS-6 업무 보드는 영문 슬러그로 이미
구현이 끝나 있었던 것** — 두 팀 결과물이 한 번도 실 데이터로 맞춰본 적이 없어서 이번에야
드러났다.

**수정**: `workload_model.py`에 `CATEGORY_ALIASES`/`PRIORITY_ALIASES` 딕셔너리와
`normalize_category()`/`normalize_priority()`를 추가해 `difficulty_of()`에서 정규화하도록 고쳤다
(기존 `CATEGORY_WEIGHT`/`PRIORITY_WEIGHT`는 그대로 유지 — 별칭 레이어만 추가). 수정 전/후 비교:

| | 수정 전 | 수정 후 |
|---|---|---|
| 미매핑 category | 6/6 전부 (100%) | 0/6 |
| 미매핑 priority | 4/4 전부 (100%) | 0/4 |
| 탐지된 이상치 수 | 0명 | 1명 (`assignee_id=3`, 업무 3건뿐이지만 난이도가 높아 편중 의심으로 새로 잡힘) |

수정 전엔 전원의 난이도가 같은 기본값으로 뭉개져서 `overload_score`가 순전히 업무 *개수*
차이만 반영했는데, 수정 후엔 업무 난이도 차이가 실제로 반영되면서 개수는 적어도 어려운
업무 비중이 높은 팀원이 새로 드러났다. 우연히 이번엔 이상치가 하나 늘었을 뿐이고, 다음
프로젝트에서는 반대로 오탐이 줄어들 수도 있다 — 핵심은 "값이 실제로 모델 판단에 반영되기
시작했다"는 것.

### 4-5. `status`도 category/priority와 같은 버그였다 — 완료율이 실제로는 0이 아니었음
4-1에서 "완료 업무가 거의 없다"고 해석했던 것 자체가 버그였다. `build_features()`가
`status == "완료"`로 완료 여부를 판정하는데, 실제 `tasks.status`는 보드 UI(`task.ts`의
`TaskStatus`) 기준 영문(`todo`/`inprogress`/`done`/`blocked`)으로 저장된다. 즉
**`완료`라는 한글 문자열과 절대 매치되지 않아 실제로 완료된 업무가 있어도 전원
`completion_rate=0`으로 조용히 계산되고 있었다** — 재검증 당시 실제 데이터를 다시 확인해보니
실제로는 (일시적으로 삭제되기 전 기준) `done` 상태 업무가 존재했다.

**수정**: `CATEGORY_ALIASES`/`PRIORITY_ALIASES`와 같은 패턴으로 `STATUS_ALIASES`/
`normalize_status()`를 `workload_model.py`에 추가하고 `build_features()`의
`is_done` 계산에 적용했다. 아래 7장 실측 삽입 테스트에서 실제로 `completion_rate`가
0이 아닌 값(0.17)으로 정상 계산되는 것까지 확인함.

## 5. 산출물

- `output/overload_score_jira_real_data.png` — Jira02(최다 업무 스냅샷) 기준 과부하 점수 그래프
- `output/overload_score_result.png` — 기존 합성 데이터 그래프(2장, 재확인용으로 재실행됨)

## 6. 다음 액션

- [x] `App/backend_fastapi/.env`(정확히는 `App/.env`)에 실제 Supabase `DATABASE_URL` 설정 완료
- [x] Supabase 실측 `category`/`priority` 불일치 확인 후 `workload_model.py`에 별칭 매핑 반영
- [x] `priority`의 `HIGH`/`high` 대소문자 혼재 원인 확인 — **시딩 스크립트가 아니라 실제 두 개의
      살아있는 입력 경로**였다. 회의록 AI → To-Do 자동생성(FS-2, Spring Boot
      `MeetingAnalysisService`/`MeetingTodo`/`FallbackMeetingAnalyzer`)은 대문자
      `HIGH`/`MEDIUM`/`LOW`를 스키마로 강제하는 반면, 업무 보드 UI(FS-6, `task.ts`의
      `Priority` 타입)는 소문자 `high`/`medium`/`low`를 쓴다. 프런트의 `taskApi.ts`는 화면
      표시용으로만 `normalizePriority()`로 소문자화하고 DB에 저장된 값 자체는 안 고치기
      때문에 실측에 둘 다 섞여 나온 것. `workload_model.py`의 `normalize_priority()`가
      대소문자 무관하게(`.lower()`) 처리하므로 FS-5 쪽은 추가 조치 불필요. 두 경로를
      하나로 통일할지는 FS-2/FS-6 쪽 결정 사항이라 여기서는 참고 정보로만 남김.
- [x] `SUPABASE_PROJECT_ID`(1)가 실제와 맞는지 재확인 — `projects` 테이블에 프로젝트가
      "데모 프로젝트"(캡스톤디자인) 하나뿐이고 `id=1`, 태스크 17건 전부 그 프로젝트 소속으로
      확인됨. 값 변경 불필요.
- [x] `workload_db.py`의 `load_project_member_count()` 죽은 코드 삭제 완료(호출부 전무 확인 후 제거,
      백엔드 테스트 22개 재통과 확인).
- [x] 4-1 "완료 업무 희소 구간 방향 태깅 불안정" 재조사 결과 **원인이 바뀜** — completion_rate가
      0으로 보였던 건 프로젝트 초반이라서가 아니라 아래 4-5의 `status` 정규화 버그 때문이었다.
      수정 후(7장 실측 테스트) 실제 완료율이 반영되는 것을 확인했으니 이 항목은 별도 모니터링
      없이 종결.
- [x] `status`도 category/priority와 동일한 영문/한글 불일치 버그였음을 확인, `STATUS_ALIASES`/
      `normalize_status()` 추가로 수정 완료 (4-5, 7장 참고).

## 7. 실제 삽입 → 조회 엔드투엔드 테스트 (2026-07-16 추가)

재검증 도중 Supabase `tasks` 테이블이 (내 작업과 무관하게) 전체 0건으로 비워진 걸 발견해서,
오히려 깨끗한 상태에서 "실제로 insert한 데이터가 `workload_db.py`를 통해 그대로 조회되는지"
엔드투엔드로 확인해봤다.

- `Jira01.csv`(97건)를 실제 스키마에 맞게 변환해 `project_id=1`(데모 프로젝트)에 삽입:
  - 담당자: Jira의 "박지수"는 실제 동명 유저(`users.id=3`)로, 나머지 5개 가상 이름은 실제
    유저 4명(김민준/이서연/박지수/최동혁)에 순차 분배 — 실제 FK 제약을 만족시키기 위한 테스트용 매핑
  - category: 레이블 키워드 → 실제 영문 `CatId` 슬러그(`backend`/`frontend`/`ai-ml`/`qa`/`other` 등)
  - priority: Jira `Highest/High/Medium` → 실제 `high/medium`(보드 UI 소문자 컨벤션)
  - status: Jira `해야 할 일/진행 중/완료/검토 중` → 실제 `todo/inprogress/done`
  - 식별용으로 `source_type='jira01_test_import'` 태깅
- `workload_db.load_tasks_from_db(project_id=1)`로 97건 전부 정상 조회됨
- `normalize_category`/`normalize_priority` 둘 다 미매핑 값 0건 확인
- `build_features` → `detect_overload_anomalies_auto` 전체 파이프라인 정상 실행, 이상치 2명 탐지
  (`assignee_id=3`은 실제 매칭분+순차분배분 합쳐 41건으로 가장 많음, `completion_rate=0.17`로
  4-5에서 고친 status 버그가 실전에서도 올바르게 동작함을 확인)

**이 테스트 데이터는 삭제하지 않고 그대로 뒀다** (사용자 결정) — 다른 팀원이 보드/대시보드에서
이 97건을 실 업무처럼 보게 된다. 나중에 정리하려면:

```sql
DELETE FROM public.tasks WHERE source_type = 'jira01_test_import';
```

## 8. FastAPI 서비스 통합 확인 (로드맵 2번째 항목)

`/ai/score/workload`는 이미 `App/backend_fastapi/app/main.py`에 등록돼 있었다(로드맵 항목이
가리키는 `App/backend_fastapi/main.py`는 실제로는 아무 데도 안 쓰이는 빈 TODO 스텁 —
Dockerfile도 `app/` 디렉터리만 COPY하고 `uvicorn app.main:app`으로 기동해서 이 스텁은
이미지에 포함조차 안 됨). 지금까지의 검증은 전부 `TestClient`(인프로세스) 기준이었어서,
실제로 `uvicorn app.main:app`을 로컬 포트에 띄워 `curl -X POST ".../ai/score/workload?project_id=1"`로
진짜 HTTP 호출까지 확인했다 — 7장에서 Python으로 직접 호출했던 것과 동일한 응답을 정상 수신.

로드맵 항목은 종결. 다만 안 쓰이는 `App/backend_fastapi/main.py` 스텁은 계속 혼란을 줄 수 있어서
삭제할지, FS-1 등 다른 담당자와 확인 후 결정할지는 별도로 정할 필요가 있다.
