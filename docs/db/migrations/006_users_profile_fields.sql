-- 마이페이지 개인정보 수정(소속/분야/GitHub) 기능을 위해 users에 컬럼 추가.
-- github_username은 URL이 아니라 아이디만 저장하고, 화면에는 아이디로만 표기한다.
-- 적용 대상: 현재 Supabase PostgreSQL (추후 OCI 자체 호스팅 이전 시 동일 스크립트 재실행)

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS affiliation      VARCHAR(100),
    ADD COLUMN IF NOT EXISTS field            VARCHAR(100),
    ADD COLUMN IF NOT EXISTS github_username  VARCHAR(100);

COMMENT ON COLUMN users.affiliation IS '소속 (예: 컴퓨터공학과 3학년)';
COMMENT ON COLUMN users.field IS '전공/관심 분야 (예: 프론트엔드 / UX 설계)';
COMMENT ON COLUMN users.github_username IS 'GitHub 아이디만 저장한다 (URL 아님)';
