-- ============================================================================
-- WorkFlow AI - 마이페이지 프로필 사진 업로드 지원
-- 05_user_field_tags.sql 이후에 실행됨.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_path VARCHAR(255);
COMMENT ON COLUMN users.profile_image_path IS '업로드된 프로필 사진의 uploads 디렉토리 기준 상대 경로 (예: avatars/5.png). PNG/JPG만 허용, 최대 10MB';
