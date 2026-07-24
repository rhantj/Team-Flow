-- 마이페이지 프로필 사진 업로드 기능을 위해 users에 컬럼 추가.
-- 실제 이미지 바이너리는 DB가 아니라 backend-spring의 uploads 디렉토리(avatars/{userId}.{ext})에 저장하고,
-- 이 컬럼에는 그 상대 경로만 저장한다. PNG/JPG만 허용하며 최대 10MB로 제한한다.
-- 적용 대상: 현재 Supabase PostgreSQL (추후 OCI 자체 호스팅 이전 시 동일 스크립트 재실행)

ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_path VARCHAR(255);
COMMENT ON COLUMN users.profile_image_path IS '업로드된 프로필 사진의 uploads 디렉토리 기준 상대 경로 (예: avatars/5.png)';
