-- 마이페이지 "분야"를 단일 문자열이 아니라 여러 개의 태그로 입력할 수 있도록
-- users.field를 VARCHAR에서 JSONB 문자열 배열로 변경한다.
-- 기존 값은 1개짜리 배열로 감싸서 보존하며 데이터 손실은 없다.
-- 적용 대상: 현재 Supabase PostgreSQL (추후 OCI 자체 호스팅 이전 시 동일 스크립트 재실행)
--
-- ⚠ 주의(파괴적 변경): 이 DB는 팀 전체가 공유하는 Supabase 인스턴스다. 이 마이그레이션을 적용하면
-- User.java가 field를 아직 String으로 매핑하는 구버전 백엔드는 Hibernate ddl-auto=validate에서
-- 컬럼 타입 불일치로 기동 실패한다. 팀원 전체가 이 커밋(User.java의 List<String> 매핑 포함)으로
-- 업데이트한 뒤에, 또는 다들 로컬 db 서비스를 쓰는 시점에 맞춰 적용할 것.

-- data_type 체크로 감싸서 재실행해도 안전하게 한다. 이미 JSONB인 상태에서 그대로 다시 실행하면
-- jsonb_build_array가 배열을 한 겹 더 감싸 데이터가 이중 중첩되므로, 실제로 VARCHAR일 때만 변환한다.
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
