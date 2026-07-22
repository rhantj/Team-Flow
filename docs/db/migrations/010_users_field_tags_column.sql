-- users.field_tags 컬럼 신설 (007_users_field_tags.sql의 대체).
--
-- 007은 기존 users.field 컬럼을 VARCHAR에서 JSONB로 제자리 변경했는데, 이는 이 DB를 공유하는
-- 팀원 중 구버전 백엔드(field를 String으로 매핑)를 쓰는 사람이 있으면 기동 불가하게 만드는
-- 파괴적 변경이었다. 이 마이그레이션은 대신 새 컬럼 field_tags를 "추가"만 하고 기존 field는
-- 그대로 둔다 — 구버전 코드는 여전히 field를 그대로 쓸 수 있고, 신버전 코드는 field_tags를
-- 쓰도록 매핑을 옮긴다. 배포 순서를 맞출 필요가 없다.
-- field 컬럼은 당분간 미사용 상태로 남겨두고, 모든 환경이 신버전으로 전환된 게 확인된 뒤
-- 별도 마이그레이션으로 제거한다.
-- 적용 대상: 현재 Supabase PostgreSQL (추후 OCI 자체 호스팅 이전 시 동일 스크립트 재실행)

-- 레거시 field 값을 field_tags로 옮기는 백필은 "컬럼이 이번에 처음 생성됐을 때"만 실행한다.
-- 예전엔 field_tags가 빈 배열([])인지로 "아직 백필 안 됨"을 판단했는데, 이러면 사용자가
-- 분야를 일부러 다 지워서([]) 정말 비운 상태에서 이 스크립트가 재실행될 경우 레거시 field 값이
-- 다시 채워져 사용자가 지운 게 원상복구되는 문제가 있었다. "컬럼이 존재했는지"는 시간이 지나도
-- 바뀌지 않는 값이라, 최초 생성 시점 단 한 번만 백필하는 게 보장된다.
DO $$
DECLARE
    column_existed boolean;
    field_data_type text;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'field_tags'
    ) INTO column_existed;

    IF NOT column_existed THEN
        ALTER TABLE users ADD COLUMN field_tags JSONB NOT NULL DEFAULT '[]'::jsonb;

        SELECT data_type INTO field_data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'field';

        IF field_data_type = 'jsonb' THEN
            UPDATE users SET field_tags = field WHERE field IS NOT NULL AND field <> '[]'::jsonb;
        ELSIF field_data_type IS NOT NULL THEN
            UPDATE users SET field_tags = jsonb_build_array(field) WHERE field IS NOT NULL AND field <> '';
        END IF;
    END IF;
END $$;

COMMENT ON COLUMN users.field_tags IS '전공/관심 분야 태그 배열 (예: ["백엔드", "인프라"]). field 컬럼을 대체한다';
COMMENT ON COLUMN users.field IS '[미사용/레거시] field_tags로 대체됨. 모든 환경 전환 확인 후 제거 예정';
