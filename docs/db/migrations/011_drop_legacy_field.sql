-- users.field(레거시) 컬럼 보관 처리 (rename, 즉시 DROP 아님).
--
-- field_tags(010_users_field_tags_column.sql)가 이 컬럼을 완전히 대체했고, 어떤 코드도 더 이상
-- field를 참조하지 않는다. 다만 DROP COLUMN은 실행 즉시 데이터가 영구히 사라져 되돌릴 수 없다 —
-- 만약 field_tags 백필이 실제로는 불완전했거나 배포 순서가 꼬여 뒤늦게 문제를 발견해도 복구할
-- 방법이 없다. 그래서 컬럼을 지우는 대신 field_legacy_removed로 이름만 바꿔 그대로 보관한다.
-- 문제가 생기면 아래 한 줄로 즉시 되돌릴 수 있다:
--     ALTER TABLE users RENAME COLUMN field_legacy_removed TO field;
-- 실제 DROP은 이 상태로 최소 한 배포 주기 이상 문제 없이 운영된 게 확인된 뒤, 별도 마이그레이션에서
-- 수행한다.
-- 적용 대상: 현재 Supabase PostgreSQL (추후 OCI 자체 호스팅 이전 시 동일 스크립트 재실행)
--
-- 배포 순서 주의: RENAME도 DROP과 마찬가지로 옛 컬럼명(field)을 참조하는 구버전 인스턴스에는
-- 즉시 오류를 유발한다 — 여러 백엔드 인스턴스가 공유 DB에 동시 접속하는 롤링 배포 상황이라면,
-- 반드시 모든 인스턴스가 field_tags 기반 코드(현재 버전)로 교체된 뒤에만 이 마이그레이션을
-- 실행할 것. 재실행해도 안전하다 — 이미 이름이 바뀐 상태라면(field 컬럼이 없으면) 아무 일도
-- 하지 않는다.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'field'
    ) THEN
        ALTER TABLE users RENAME COLUMN field TO field_legacy_removed;
    END IF;
END $$;
