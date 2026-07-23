-- WorkFlow AI - 프로필 사진(avatar) 및 분야 태그(field_tags) 컬럼을 Flyway로도 보장한다.
--
-- 이 컬럼들은 지금까지 db/init(06_user_avatar.sql, 08_users_field_tags_column.sql)이나
-- docs/db/migrations(008_users_avatar.sql, 010_users_field_tags_column.sql)로만 적용돼
-- 왔다 — 둘 다 Flyway가 알지 못하는 경로다. baseline-version을 20260721_1로 고정해 Flyway를
-- 도입했지만, User 엔티티가 실제로 매핑하는 field_tags/profile_image_path는 어떤 Flyway
-- 마이그레이션에도 들어있지 않았다. 그래서 db/init을 거치지 않았거나 docs/db/migrations의
-- 008/010을 아직 수동 적용하지 못한 DB에 Flyway만으로 뒤늦게 baseline을 잡으면, Flyway는
-- "baseline 이하는 전부 완료된 이력"이라고 믿어버려 이 컬럼들의 부재를 알아채지 못하고,
-- 그 결과 JPA ddl-auto=validate가 기동 시점에 실패한다. 이 마이그레이션을 추가해 Flyway
-- 경로만으로도 스키마가 완전해지도록 한다.
--
-- 아래 SQL은 db/init/08_users_field_tags_column.sql·06_user_avatar.sql과 동일한 내용이다 —
-- 이미 db/init이나 docs/db/migrations로 적용된 환경에서는 IF NOT EXISTS/존재 확인으로
-- 전부 안전하게 스킵된다.

ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_path VARCHAR(255);
COMMENT ON COLUMN users.profile_image_path IS '업로드된 프로필 사진의 uploads 디렉토리 기준 상대 경로 (예: avatars/5.png). PNG/JPG만 허용, 최대 10MB';

-- 레거시 field 값을 field_tags로 옮기는 백필은 "컬럼이 이번에 처음 생성됐을 때"만 실행한다 —
-- 사용자가 분야를 일부러 다 지운([]) 상태에서 이 스크립트가 재실행돼 레거시 값이 되살아나는
-- 걸 막기 위해서다. Flyway는 이 파일을 DB당 정확히 한 번만 실행하므로 이론적으로는 재실행
-- 걱정이 없지만, db/init·docs/db/migrations 경로와 동일한 로직을 유지해 어느 경로로 적용되든
-- 결과가 같도록 맞춘다.
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

-- field 컬럼은 (011 등 수동 절차로) 이미 field_legacy_removed로 이름이 바뀌어 없어졌을 수
-- 있다. 그 상태에서 COMMENT ON COLUMN을 무조건 실행하면 존재하지 않는 컬럼을 대상으로
-- 실패하므로, 컬럼이 남아있을 때만 코멘트를 단다.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'field'
    ) THEN
        COMMENT ON COLUMN users.field IS '[미사용/레거시] field_tags로 대체됨. 모든 환경 전환 확인 후 제거 예정';
    END IF;
END $$;
