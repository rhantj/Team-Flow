-- ============================================================================
-- 로컬(이메일/비밀번호) 회원가입 지원을 위한 추가 컬럼.
-- additive/idempotent: 새 볼륨(fresh init)에서도, 이미 데이터가 쌓인 기존 DB에
-- 수동으로 실행해도 안전하다 (docker-entrypoint-initdb.d는 볼륨이 비어있을 때만
-- 자동 실행되므로, 이미 떠 있는 DB에는 이 파일을 직접 psql로 실행해야 반영된다).
-- 예: docker compose exec -T db psql -U postgres -d workflow -f - < 04_add_password_auth.sql
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
COMMENT ON COLUMN users.password_hash IS '로컬(이메일/비밀번호) 회원가입 계정만 사용. BCrypt 해시. Google/데모 계정은 NULL.';
