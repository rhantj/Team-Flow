-- ============================================================================
-- WorkFlow AI - 배포 전 운영 DB에 수동으로 실행해야 하는 스키마 변경 모음
--
-- 이 저장소는 Flyway 등 자동 마이그레이션 도구를 쓰지 않는다. 새 백엔드 이미지를 배포하기
-- 전에 이 파일을 운영 DB에 psql로 직접 실행해야 한다 — spring.jpa.hibernate.ddl-auto=validate가
-- 이 절차가 빠졌을 때(엔티티가 매핑하는 컬럼이 실제 DB에 없을 때) 애플리케이션 기동을 막아주는
-- 마지막 안전판이다.
--
-- 실행 예:
--   docker exec -i workflow-db psql -U postgres -d workflow < App/DEPLOY_MANUAL.sql
--   (Supabase 등 원격 DB라면 동일 SQL을 psql/SQL 콘솔로 직접 실행)
--
-- 모든 구문은 ADD COLUMN IF NOT EXISTS라 이미 적용된 환경에서 재실행해도 안전하다(no-op).
-- 이 파일은 "지금 시점 기준으로 아직 안 돌았을 수 있는 것"만 담는다 — 과거에 이미 적용된
-- 이력이 있는 컬럼(예: field_tags/profile_image_path/affiliation/github_username, 007/008
-- 참고)까지 전부 replay하는 파일이 아니다. 완전히 처음부터 새 운영 DB를 구성해야 한다면
-- docs/db/migrations/ 001~012를 순서대로 실행할 것(README.md 참고).
--
-- 새 스키마 변경이 필요할 때: 이 파일에 이어서 추가하지 말고, docs/db/migrations/에 다음
-- 번호로 파일을 추가하고 db/init/에도 같은 내용을 반영한 뒤, 그 개별 파일을 배포 전에
-- 실행할 것(App/DEPLOY_OCI.md 8절 체크리스트 참고). 이 파일은 배포 시점의 "지금 당장
-- 실행할 목록"을 계속 갱신해 두는 용도다.
-- ============================================================================

-- terms_agreed_at: 이메일/비밀번호 회원가입 시 이용약관 동의 시각.
-- 출처: docs/db/migrations/012_users_terms_agreement.sql (동일 내용)
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMP;
COMMENT ON COLUMN users.terms_agreed_at IS '이메일/비밀번호 회원가입 시 이용약관에 동의한 시각. Google OAuth/데모 계정은 이 절차를 거치지 않아 NULL';
