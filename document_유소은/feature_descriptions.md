# Feature Descriptions (피처 설명 목록)

> `ml_delay_risk` 모델 파이프라인이 실제로 계산해 후보로 사용하는 피처 40개 전체 목록.
> `feature_engineering.py`(`build_static_features`, `build_dynamic_features`, `compute_cross_features`)와
> `dataset_builder.py`가 만드는 필드에 1:1로 대응하며, 학습/실시간 추론(`delay_service.py`)이 이 정의를
> 그대로 공유한다. 이 중 실제로 모델에 최종 선정되는 피처는 `select_important_features`의 중요도(gain)
> 분석 결과에 따라 달라지며, 현재는 6개(`has_original_estimate`, `elapsed_hours_at_cutoff`,
> `hours_in_current_status`, `priority_name`, `issuetype_name`, `original_estimate_seconds`)가 선정되어 있다.

| 피처명 (Feature Name) | 설명 (Description) |
| :--- | :--- |
| `project_key` | 프로젝트 코드 (이슈 키 접두사, 예: JELLY) |
| `issuetype_name` | 이슈 유형 (Bug/Task/Improvement 등) |
| `priority_name` | 우선순위 (Blocker/Critical/Major/Minor/Trivial) |
| `reporter` | 이슈 등록자 (빈도 인코딩) |
| `is_subtask` | 하위 작업(subtask) 여부 |
| `has_parent` | 상위 이슈(에픽 등)에 속해 있는지 여부 |
| `parent_unresolved` | 상위 이슈(에픽)가 아직 미해결 상태인지 여부 |
| `num_subtasks` | 하위 작업 개수 |
| `num_unresolved_subtasks` | 하위 작업 중 미해결 개수 |
| `num_components` | 소속 컴포넌트(모듈) 개수 |
| `num_fixversions` | 목표 릴리즈 버전 개수 |
| `has_released_fixversion` | 목표 릴리즈 버전 중 이미 배포된 것이 있는지 여부 |
| `num_versions` | 영향받는 버전 개수 |
| `has_original_estimate` | 최초 예상 소요시간(estimate)이 설정되어 있는지 여부 |
| `original_estimate_seconds` | 최초 예상 소요시간(초 단위) |
| `num_issuelinks_total` | 다른 이슈와의 연관관계 총 개수 |
| `num_blocked_by_links` | '~에 의해 막힘' 관계 개수 |
| `num_unresolved_blockers` | 블로커 이슈 중 아직 해결되지 않은 것의 개수 |
| `created_day_of_week` | 생성 요일 (0=월요일 ~ 6=일요일) |
| `created_hour` | 생성 시각 (0~23시) |
| `summary_length` | 이슈 제목 길이 (문자 수, 복잡도 근사치) |
| `status_at_cutoff` | cutoff 시점의 상태 (Open/In Progress/Blocked 등) |
| `assignee_at_cutoff` | cutoff 시점의 담당자 (빈도 인코딩) |
| `num_events_before_cutoff` | cutoff 이전 변경 이력(이벤트) 총 개수 |
| `num_status_changes` | 상태 변경 횟수 |
| `num_assignee_changes` | 담당자 변경(재배정) 횟수 |
| `num_reopens` | 상태가 Open/Reopened로 되돌아간 횟수 |
| `hours_in_current_status` | 마지막 상태 변경 이후 ~ cutoff까지 경과한 시간 |
| `blocked_hours_before_cutoff` | 블로커 상태에 머문 누적 시간 |
| `num_comments_before_cutoff` | cutoff 이전 댓글 수 |
| `num_unique_commenters` | 댓글을 남긴 고유 인원 수 |
| `hours_since_last_comment` | 마지막 댓글로부터 ~ cutoff까지 경과 시간 |
| `num_worklog_entries` | 작업 기록(worklog) 건수 (봇 계정 제외) |
| `num_unique_workers` | 실제 작업한 고유 인원 수 |
| `time_spent_seconds_before_cutoff` | cutoff까지 누적 투입 시간 (초, 봇 제외) |
| `progress_ratio_at_cutoff` | 진행률 (누적 투입시간 ÷ 최초 예상시간) |
| `elapsed_hours_at_cutoff` | 이슈 생성 후 ~ cutoff까지 경과 시간 (절대값, 시간 단위) |
| `activity_count_recent_window` | 최근 N일간 활동(댓글+상태변경+작업기록) 합계 |
| `is_self_assigned` | 보고자와 담당자가 동일 인물인지 여부 |
| `snapshot_offset_days` | 스냅샷 시점 (이슈 생성 후 며칠째인지) |

## 참고: 학습 피처에서 제외되는 값 (데이터 누수 방지)

아래 4개는 `build_dynamic_features`가 계산은 하지만, `risk_class` 라벨을 계산하는
`classify_risk()`의 입력값 그 자체이거나 그로부터 역산 가능한 값이라 `LEAKY_FEATURE_COLUMNS`로
지정되어 위 40개 후보에서 애초에 제외되어 있다.

| 필드명 | 제외 이유 |
| :--- | :--- |
| `elapsed_ratio_at_cutoff` | `classify_risk()`의 입력값 그 자체 |
| `blocked_ratio_at_cutoff` | `classify_risk()`의 입력값 그 자체 |
| `imbalance_index_at_cutoff` | `classify_risk()`의 입력값 그 자체 |
| `hours_until_deadline_at_cutoff` | `proxy_deadline_hours - elapsed_hours_at_cutoff`로 역산 가능 |
