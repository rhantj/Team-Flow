# 이 디렉터리는 동결(historical)됐습니다

여기 있는 `NNN_*.sql` 파일들은 Flyway 도입 이전에 운영 DB(Supabase/OCI)에 수동으로
`psql`을 통해 적용하던 방식의 이력입니다. 번호가 겹치는 파일이 여러 개 있는 것도(예:
`006_users_profile_fields.sql`과 `006_task_results.sql`) 여러 기능 브랜치가 각자 독립적으로
다음 번호를 붙이다 병합되며 생긴 결과입니다 — 실제 적용 순서를 이 번호만으로는 알 수
없습니다.

**새 스키마 변경은 여기에 파일을 추가하지 말고**
[`backend_spring/src/main/resources/db/migration/`](../../../App/backend_spring/src/main/resources/db/migration/)에
Flyway 규칙(`V<날짜>_<순번>__설명.sql`)으로 추가하세요. 자세한 배경과 운영 활성화 절차는
[`App/DEPLOY_OCI.md`](../../../App/DEPLOY_OCI.md) 8절을 참고하세요.

011(`011_drop_legacy_field.sql`)만은 예외입니다 — `users.field` 컬럼 정리는 구버전 인스턴스를
깨뜨릴 수 있는 파괴적 변경이라 의도적으로 Flyway나 자동 배포 경로에 넣지 않았고, 여전히
`App/DEPLOY_OCI.md` 8-1절의 체크리스트를 사람이 확인한 뒤 수동으로 한 번만 실행합니다.
