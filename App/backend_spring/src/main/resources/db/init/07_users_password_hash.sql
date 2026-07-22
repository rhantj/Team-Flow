-- ============================================================================
-- WorkFlow AI - users.password_hash 컬럼 보강
--
-- User.java와 AuthService의 이메일/비밀번호 회원가입·로그인 로직은 이 컬럼을 전제로 하지만,
-- 커밋된 01_base_schema.sql에는 빠져 있어 이 파일 없이 새로 DB를 초기화하면 Hibernate
-- ddl-auto=validate에서 기동 실패한다. ADD COLUMN IF NOT EXISTS라 몇 번을 실행해도 안전하다.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
COMMENT ON COLUMN users.password_hash IS 'BCrypt 해시. provider=local 계정만 값이 있고 OAuth 계정은 NULL';
