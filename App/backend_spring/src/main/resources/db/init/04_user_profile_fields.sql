-- ============================================================================
-- WorkFlow AI - 마이페이지 개인정보 수정(소속/분야/GitHub) 스키마 추가
-- 01_base_schema.sql 이후에 실행됨.
-- ============================================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS affiliation      VARCHAR(100),
    ADD COLUMN IF NOT EXISTS field            VARCHAR(100),
    ADD COLUMN IF NOT EXISTS github_username  VARCHAR(100);

COMMENT ON COLUMN users.affiliation IS '소속 (예: 컴퓨터공학과 3학년)';
COMMENT ON COLUMN users.field IS '전공/관심 분야 (예: 프론트엔드 / UX 설계)';
COMMENT ON COLUMN users.github_username IS 'GitHub 아이디만 저장한다 (URL 아님). 표시 시 github.com/{username} 형태로 조합';
