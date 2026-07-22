-- ============================================================================
-- WorkFlow AI - 마이페이지 "분야"를 다중 태그로 저장하도록 확장
-- 04_user_profile_fields.sql 이후에 실행됨.
--
-- ⚠ 주의(파괴적 변경): 공유 Supabase DB에 적용하면, User.java가 아직 field를 String으로
-- 매핑하는 구버전 백엔드는 컬럼 타입 불일치로 기동에 실패한다(docs/db/migrations/007 참고).
-- ============================================================================

-- 기존 단일 문자열 값은 1개짜리 배열로 감싸서 보존한다.
-- data_type 체크로 감싸서 재실행해도 안전하게 한다(이미 JSONB면 건너뛴다).
DO $$
BEGIN
    IF (
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'field'
    ) IS DISTINCT FROM 'jsonb' THEN
        ALTER TABLE users
            ALTER COLUMN field TYPE JSONB
            USING (CASE WHEN field IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(field) END);
    END IF;
END $$;

ALTER TABLE users ALTER COLUMN field SET DEFAULT '[]'::jsonb;
ALTER TABLE users ALTER COLUMN field SET NOT NULL;

COMMENT ON COLUMN users.field IS '전공/관심 분야 태그 배열 (예: ["백엔드", "인프라"])';
