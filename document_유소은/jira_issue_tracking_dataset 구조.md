# Zenodo - Apache Jira Issue Tracking Dataset 구조

> 원본: `jira_issue_tracking_dataset 구조.docx`
> 이 문서는 원본 스키마 설명에 더해, **실제 `ml_delay_risk` 모듈이 각 필드를 어떻게 쓰고 있는지**(또는 쓰지 않는지)를 `> 구현:` 인용구로 덧붙였다. 코드 경로는 모두 `App/backend_fastapi/ml_delay_risk/` 기준이다.

Zenodo - Apache Jira Issue Tracking Dataset의 핵심 컬렉션 4가지(`issues`, `events`, `comments`, `worklogs`) 구조와 주요 데이터 필드를 스키마에 기반하여 정리한다.

## 개요

| 컬렉션 | 문서 수(추정) | 인덱스 |
|---|---|---|
| issues | 1,157,541 | `_id` 단일 인덱스만 존재 |
| events | 9,783,070 | `_id` 단일 인덱스만 존재 |
| comments | 5,112,459 | `_id` 단일 인덱스만 존재 |
| worklogs | 636,182 | `_id` 단일 인덱스만 존재 |

네 컬렉션 모두 `_id`가 JIRA 내부 숫자 ID를 문자열로 저장한 값(예: `'13166039'`)이고, `_id`, `id` 필드가 동일한 값을 갖는다. `issue` / `issueId` 필드로 `issues` 컬렉션과 연결되는 구조(사실상 정규화되지 않은 조인 키)다.

> **구현**: `issue`/`issueId`가 컬렉션마다 표기가 다르다는 문제(아래 참고)를 실제로 겪었다. `models/snapshot_repository.py`의 `_issue_identifiers()`가 이슈의 `_id`/`id`/`key` 세 가지를 모두 후보로 모아 `$in` 조회를 하는 방식으로 이 불일치를 방어한다.
>
> **구현**: 인덱스 부재 문제도 실제로 발생 — `models/mongo_client.py`의 `ensure_indexes()`가 `events.issue`, `comments.issue`, `worklogs.issue`/`worklogs.issueId`에 단일 인덱스를 생성한다. `dataset_builder.py`가 학습 데이터를 만들기 전에 항상 이 함수를 먼저 호출한다.

---

## 1. `issues` (이슈(티켓) 컬렉션)

JIRA REST API의 이슈 응답을 거의 그대로 저장한 컬렉션. 예측 모델의 '뼈대'이자 타겟(Label)을 정의하는 기준점(핵심 컬렉션)이다.

> **구현**: 학습 대상 이슈를 고르는 쿼리(`dataset_builder.py`의 `_ISSUE_QUERY`)가 바로 이 컬렉션에 걸린다.

### 기본 식별/담당 필드

- **`_id` / `id` / `key`**: 이슈의 고유 식별자 및 프로젝트 내 부여 번호. 문자열(String). 예: `'10012'`, `'JELLY-1'`.
  > **구현**: `feature_engineering.py`의 `build_static_features()`에서 `issue_key`(모델 입력에는 안 씀, 그룹 분할용 키로만 사용)와 `project_key`(`JELLY-1` → `JELLY`, `parse_project_key()`)로 가공.
- **`assignee` / `creator` / `reporter`**: 담당자, 생성자, 보고자. 계정명 문자열. 예: `'jstrachan'`, `'bob'`.
  > **구현**: `reporter`는 정적 피처로 그대로 사용(빈도 인코딩). `assignee`는 cutoff 시점 재구성값(`assignee_at_cutoff`, 아래 events 참고)의 폴백값으로 쓰인다. `creator`는 현재 코드에서 사용하지 않음.
- **`status`**: 현재 업무 상태. 중첩 객체 `{id, name, description, iconUrl, self, statusCategory:{...}}`. `name`에 `Open`, `In Progress`, `Resolved`, `Closed`, `Blocked` 등.
  > **구현**: 이슈 문서 자체의 `status`는 사용하지 않는다 — "현재" 상태를 그대로 피처로 쓰면 미래 정보 누수가 되므로, `events` 컬렉션의 changelog를 cutoff 시점까지만 재생(replay)해서 `status_at_cutoff`를 별도로 계산한다(`build_dynamic_features()`).
- **`issuetype`**: 이슈 종류. `{id, name, description, iconUrl, subtask, avatarId, self}`. `name`에 `Bug`, `New Feature`, `Task`, `Improvement` 등.
  > **구현**: `issuetype_name`(범주형 피처, Proxy Deadline 그룹핑 키)과 `is_subtask`(`issuetype.subtask`)로 사용.
- **`priority`**: 중요도/우선순위. `{id, name, iconUrl, self}`. `name`에 `Blocker`, `Critical`, `Major`, `Minor`, `Trivial` 등.
  > **구현**: `priority_name`(범주형 피처, Proxy Deadline 그룹핑 키).
- **`summary` / `description`**: 제목과 상세 설명. 자유 텍스트.
  > **구현**: 현재 미사용(텍스트 임베딩/NLP 피처는 이 모델 범위 밖).

### 1) 시간 및 진행률 관련 객체 (가장 핵심 피처)

- **`created`**: 이슈 생성 일시. `ISODate`.
  > **구현**: 모든 스냅샷 시점(cutoff)의 기준점. `dataset_builder.py`가 `created + 1/3/7/14/30일`을 스냅샷 후보로 계산한다.
- **`resolution`**: 완료 시 해결책. 완료되지 않은 이슈는 필드 자체가 없음. `resolutiondate`와 짝을 이룸. `{id, name, description, self}`.

  | 클래스 | 값 | 건수 | 비율 | 의미 |
  |---|---|---|---|---|
  | 정상 완료(Class 0 후보) | Fixed | 738,654 | 63.8% | 정상 수정 완료 |
  | | Done | 18,497 | 1.6% | 완료(버그 외 작업 티켓 등) |
  | | Resolved | 3,805 | 0.3% | 해결됨(일반) |
  | | Implemented | 8,052 | 0.7% | 구현 완료(기능 요청류) |
  | | Delivered | 160 | <0.1% | 전달 완료 |
  | | Staged | 42 | <0.1% | 스테이징 배포됨 |
  | | Workaround | 646 | 0.1% | 우회 방법으로 해결 |
  | 조기/비정상 종료(제외 대상) | Duplicate | 47,382 | 4.1% | 다른 이슈와 중복 |
  | | Won't Fix | 46,716 | 4.0% | 수정하지 않기로 결정 |
  | | Not A Problem | 26,880 | 2.3% | 문제로 보지 않음 |
  | | Invalid | 23,036 | 2.0% | 유효하지 않은 이슈 |
  | | Cannot Reproduce | 17,820 | 1.5% | 재현 불가 |
  | | Incomplete | 11,551 | 1.0% | 정보 부족 |
  | | Abandoned | 5,653 | 0.5% | 작업 중단/포기 |
  | | Won't Do | 3,628 | 0.3% | 하지 않기로 결정 |
  | | Not A Bug | 3,287 | 0.3% | 버그 아님 |
  | | Information Provided | 2,894 | 0.3% | 정보 제공 후 종결 |
  | | Auto Closed | 2,755 | 0.2% | 자동 종료(봇/정책) |
  | | Works for Me | 342 | <0.1% | 재현 환경에서 정상 동작 |
  | 보류/애매 | Later / Pending Closed / Feedback Received / REMIND | 8,061 | ~0.6% | 문맥에 따라 판단 필요 |
  | 아직 미해결 | (null) | 187,680 | 16.2% | 타겟이 없어 학습셋 제외 대상 |

  > **⚠️ 원본 문서 권고**: "어떤 개발자가 업무를 부여받았지만 10분 만에 중복 처리로 닫은 이슈(`Duplicate`)를 '초고속 완료 우수 사례'로 학습하면 안 됨" — `Fixed`/`Done` 등 순수 정상 완료 티켓만 필터링 권장.
  >
  > **구현**: `feature_engineering.py`의 `NORMAL_RESOLUTIONS = ["Fixed","Done","Resolved","Implemented","Delivered","Staged","Workaround"]`가 정확히 이 "정상 완료(Class 0 후보)" 표의 7개 값 그대로다. `dataset_builder.py`의 `_ISSUE_QUERY`가 `resolution.name`을 이 목록으로 필터링하고, `resolutiondate`/`created`가 없는(=미해결) 이슈도 함께 제외한다.

- **`resolutiondate`**: 완료 일시. `resolution`과 짝을 이룸.
  > **구현**: 스냅샷 종료 조건(`candidate_cutoffs = [c for c in candidate_cutoffs if c < resolved]`)과 Proxy Deadline 계산(처리시간 = `resolutiondate - created`)에 사용.
- **`progress` / `aggregateprogress`**: `{progress, total, percent}`. `total`이 0이면 `percent` 누락.
  > **구현**: 미사용 — 대신 아래 `timetracking`의 초 단위 필드를 직접 사용(원본 문서 2번째 파일에서 권고한 방향과 동일).
- **`timetracking`**: 사람이 읽는 문자열(`"2d"`, `"4h"`)과 초 단위 정수 데이터를 모두 제공. `{originalEstimate, originalEstimateSeconds, remainingEstimate, remainingEstimateSeconds, timeSpent, timeSpentSeconds}`.
  > **구현**: `originalEstimateSeconds`는 `build_static_features()`의 `original_estimate_seconds`/`has_original_estimate`로, `timeSpentSeconds`는 `worklogs` 컬렉션에서 cutoff 이전 것만 합산해 `time_spent_seconds_before_cutoff`로 사용. 이 둘의 비율이 바로 "진행률 불균형 지수"의 절반(`progress_ratio_at_cutoff`) — 자세한 내용은 설계 문서(`지연위험도_분류모델_설계.md`) 참고.

### 2) 이슈 연관성 및 계층 구조 (연쇄 지연 파악용)

- **`issuelinks[]`**: 이슈 간 연관 관계(`is blocked by`, `duplicates`, `relates to` 등) 배열. `type.inward/outward`, `inwardIssue/outwardIssue`(연결된 이슈의 status/priority 스냅샷 포함).
  > **구현**: `feature_engineering.py`의 `count_blocked_by_links()`가 `type.inward`가 `"is blocked by"`/`"blocked by"`인 링크만 골라 `num_blocked_by_links`(전체 블로커 링크 수)와 `num_unresolved_blockers`(그중 연결된 이슈의 status가 아직 `resolved`/`closed`/`done`이 아닌 것)를 계산한다. 다만 이 `status` 스냅샷은 **현재 시점** 값이라, 학습 시점(과거 스냅샷)에서는 엄밀히는 근사치라는 한계가 있다(코드 주석에 명시).
- **`parent`**: 상위 이슈(에픽 등) 정보.
  > **구현**: `has_parent`(존재 여부만 boolean으로 사용).
- **`subtasks[]`**: 하위 작업 목록. 하나라도 지연되면 부모 이슈 전체가 지연될 확률 ↑.
  > **구현**: `num_subtasks`(개수만 사용, 하위 작업 자체의 상태까지 파고들지는 않음).

### 3) 프로젝트 메타데이터

- **`components[]`, `fixVersions[]`, `versions[]`**: 소속 모듈, 목표 릴리즈 버전, 영향 버전. `{id, name, description/releaseDate/released, archived, self}` 배열.
  > **구현**: 각각 개수만 `num_components`/`num_fixversions`/`num_versions`로 사용. `released`(배포 완료 여부) 등 세부 값은 미사용.

### 4) 관심도 및 커뮤니케이션 메타데이터

- **`votes`, `watches`**: 투표/관심(Watch) 수. 비정상적으로 높으면 병목(Bottleneck) 이슈일 가능성.
  > **구현**: **미사용**. 현재 시점 누적값이라 과거 스냅샷 시점의 실제 값을 알 수 없어(=시계열 재구성 불가) 피처화하지 않았다.
- **`attachment[]`**: 첨부파일 메타데이터(작성자 아바타 URL 포함, 용량 비대화 주의).
  > **구현**: **미사용**. 원본 문서가 경고한 대로 첨부파일 배열은 아예 조회조차 하지 않는다(MongoDB 쿼리에 프로젝션도 안 걸림).

### 5) 작업자 및 커스텀 환경 필드

- **`authors[]`, `reviewers[]`, `language[]`, `sprint[]`**: 코드 작성자, 리뷰어, 언어, 스프린트 정보.
  > **구현**: **미사용**. 특히 `sprint`(이월 여부 추적 가능)는 향후 개선 여지가 있는 필드.
- **`flags[]`, `hadoopflags[]`, `lucenefields[]`, `patchinfo[]`**: Apache 프로젝트별 커스텀 필드. 노이즈 가능성.
  > **구현**: 원본 권고대로 **완전히 제외**.

---

## 2. `events` (이슈 변경 이력 컬렉션 = change log)

JIRA의 필드 변경 히스토리(audit log). 업무가 어떤 상태에서 얼마나 정체되어 있는지 파악하는 핵심 시계열 데이터.

> **구현**: 이 컬렉션이 `feature_engineering.py`의 동적 피처 대부분의 원천이다. `models/snapshot_repository.py`의 `fetch_snapshot()`이 이슈당 한 번만 이 컬렉션을 조회하고(가장 늦은 cutoff 기준), 여러 스냅샷은 메모리에서 다시 잘라 재사용한다.

- **`_id`, `id`**: 이벤트 고유 식별자.
- **`issue`**: 이벤트가 발생한 원본 이슈 식별자. 예: `'JELLY-1'`(이슈 **key** 형태로 예시가 나와 있음).
  > **구현**: 위 "개요"에서 언급했듯, `comments.issue`는 문서에 `_id`(숫자) 예시로 나와 있어 컬렉션마다 조인 키 표기가 다르다. `_issue_identifiers()`가 `_id`/`id`/`key` 전부를 후보로 넣어 이 불일치를 흡수한다.
- **`author`**: 변경을 수행한 작업자.
  > **구현**: `num_assignee_changes`/`num_status_changes` 등 "누가"보다 "무엇이 몇 번" 바뀌었는지 집계할 때만 쓰이고, `author` 자체를 피처로 쓰지는 않는다.
- **`created`**: 변경 시각.
  > **구현**: cutoff 이전(`<=`) 이벤트만 필터링하는 기준 시각. `filter_before()`.
- **`items[]`**: 실제 변경 내용. `field`(예: `status`, `assignee`), `fromString`/`toString`(변경 전/후 값).

  | 필드 | 의미 | 값 예시 |
  |---|---|---|
  | `field` | 변경된 항목명 | `'status'`, `'assignee'` |
  | `fieldtype` | 필드 출처 | `'jira'`(내장), `'custom'`(커스텀) |
  | `from` / `to` | 변경 전/후 값의 내부 ID(nullable) | 상태 ID 1(Open) → 3(In Progress) |
  | `fromString` / `toString` | 사람이 읽는 변경 전/후 값(nullable) | `fromString:"alice", toString:"bob"` |

  > **구현**: `build_dynamic_features()`가 `field=="status"`인 이벤트를 시간순으로 재생해 `status_at_cutoff`, `hours_in_current_status`, `_status_time_breakdown()`(상태별 누적 체류시간 → `blocked_hours_before_cutoff`)을 계산하고, `toString`이 `Open`/`Reopened`로 돌아간 횟수를 `num_reopens`로 집계한다. `field=="assignee"`인 이벤트는 `assignee_at_cutoff`(재구성값)와 `num_assignee_changes`에 사용된다. `fieldtype`, `from`/`to`(내부 ID)는 미사용.

---

## 3. `comments` (이슈 댓글 컬렉션)

작업자의 '최근 활동 모멘텀'과 소통 빈도를 측정하는 지표.

- **`_id`, `id`**: 댓글 고유 식별자.
- **`issue`**: 소속 이슈의 `_id`(문서상 숫자 ID 예시).
- **`author` / `updateAuthor`**: 작성자 / 최종 수정자.
- **`body`**: 댓글 텍스트.
  > **구현**: **미사용**(텍스트 내용 자체는 분석하지 않고, "댓글이 있었다/최근에 있었다"는 존재/타이밍만 사용).
- **`projectname`**: 소속 프로젝트명.
  > **구현**: 미사용 — 프로젝트 구분은 이슈의 `key` 접두사(`project_key`)로 대신한다.
- **`self`**: REST API URL. 미사용.
- **`created` / `updated`**: 작성/수정 시각.
  > **구현**: `created` 기준으로 cutoff 이전 댓글만 필터링해 `num_comments_before_cutoff`, `num_unique_commenters`(작성자 집합 크기), `hours_since_last_comment`(마지막 댓글~cutoff 경과시간), `activity_count_recent_window`(최근 N일 활동 합산의 일부)에 사용.

---

## 4. `worklogs` (작업 기록 컬렉션)

`comments`와 유사한 구조에 시간 기록이 추가된 컬렉션. 진행률을 정밀하게 추적하고 작업자 단위 리소스 투입량을 파악할 때 사용.

- **`id`**: 작업 기록 고유 식별자.
- **`issue` / `issueId`**: 원본 이슈 식별자(값 동일).
- **`author` / `updateAuthor`**: 작업을 수행/수정한 작업자.
  > **⚠️ 원본 문서 지적**: GitHub 봇이 PR 리뷰 코멘트를 자동으로 남기는 경우가 실제로 있어, `author`에서 봇 계정을 반드시 예외 처리해야 함(안 그러면 봇의 자동화 활동이 근로자 성실도로 잘못 학습됨).
  >
  > **구현**: `models/bot_filter.py`의 `is_bot_author()`가 `author`에 `"bot"`, `"[bot]"`, `"hudson"`, `"jenkins"`, `"buildbot"`, `"github-actions"` 문자열이 포함되면 봇으로 간주해 제외한다. `build_dynamic_features()`가 `human_worklogs = [w for w in worklogs if not is_bot_author(w.get("author"))]`로 필터링한 뒤에만 진행률/활동량을 계산한다.
- **`comment`**: 작업 로그 텍스트(자동화 봇 코멘트 포함 가능).
  > **구현**: 미사용(위와 동일하게, 봇 여부 판정은 텍스트가 아니라 `author` 계정명으로 한다).
- **`created`, `updated`, `started`**: 생성/수정/실제 작업 시작 시각.
  > **구현**: `started` 기준으로 cutoff 이전 것만 필터링(`filter_before(all_worklogs, "started", cutoff)`).
- **`timeSpent`**: 사람이 읽는 문자열(`"2h 30m"`, `"1d"`).
  > **구현**: 미사용 — 아래 `timeSpentSeconds`를 직접 쓴다(문자열 파싱 불필요, 원본 문서 2번째 파일의 권고와 정확히 일치).
- **`timeSpentSeconds`**: 초 단위 정수(Int32). 예: 2시간 → 7200.
  > **구현**: 봇 제외 후 합산해 `time_spent_seconds_before_cutoff`. `original_estimate_seconds`와의 비율이 `progress_ratio_at_cutoff`(진행률 불균형 지수의 핵심 절반).
- **`self`**: REST API URL. 미사용.

---

## 실제 코드에서 이 스키마를 다루는 파일 맵

| 파일 | 역할 |
|---|---|
| `config.py` | 컬렉션 이름(`issues_collection` 등), DB 접속 정보 |
| `models/mongo_client.py` | 접속(`MongoClient`), 인덱스 생성(`ensure_indexes`) |
| `models/snapshot_repository.py` | 이슈 하나에 대한 events/comments/worklogs 조회(`fetch_snapshot`) + 조인 키 불일치 방어 |
| `models/bot_filter.py` | worklogs 봇 계정 필터링 |
| `models/feature_engineering.py` | 스키마 필드 → 실제 피처/라벨 변환 로직 (`build_static_features`, `build_dynamic_features`, `classify_risk`) |
| `models/dataset_builder.py` | `issues` 쿼리 + 스냅샷 생성 + 학습 데이터프레임 조립 |
