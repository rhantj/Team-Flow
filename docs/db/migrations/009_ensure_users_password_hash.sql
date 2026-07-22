-- User.java와 AuthService의 이메일/비밀번호 회원가입·로그인 로직은 users.password_hash를
-- 전제로 하지만, 커밋된 이력에는 이 컬럼을 추가하는 마이그레이션이 없었다 — 즉 이 리포를
-- 새로 클론해 DB를 초기화하면 회원가입/기동이 실패한다. ADD COLUMN IF NOT EXISTS라 이미
-- 컬럼이 있는 환경(예: 팀이 공유하는 Supabase)에서 재실행해도 안전하다.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
COMMENT ON COLUMN users.password_hash IS 'BCrypt 해시. provider=local 계정만 값이 있고 OAuth 계정은 NULL';
