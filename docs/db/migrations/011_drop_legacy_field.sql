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
-- 실행할 것.
--
-- 재실행 안전성: 이 저장소는 마이그레이션 이력 추적(Flyway 등)을 쓰지 않아, DEPLOY_OCI.md의
-- 배포 스크립트는 재배포할 때마다 docs/db/migrations/0*.sql 전체를 처음부터 다시 실행한다.
-- 즉 이 파일도 매 배포마다 재실행된다는 뜻이다. field가 이미 없으면 물론 안전하지만, 006이
-- (ADD COLUMN IF NOT EXISTS로) field를 다시 만들어낸 뒤 이 스크립트가 또 도는 경우까지
-- 고려해야 한다 — 그 상태에서 무조건 RENAME을 시도하면 대상 이름 field_legacy_removed가
-- 이미 있어 "column already exists" 오류로 실패한다. 그래서 두 컬럼의 존재 여부를 함께 보고
-- 분기한다: field_legacy_removed가 아직 없으면 정상적으로 rename하고, 이미 있으면(= 과거에
-- 한 번 rename이 끝난 뒤 006이 새로 만들어낸 빈 field일 뿐, 진짜 데이터가 아니다) rename 대신
-- 그 빈 field를 그냥 지운다.

DO $$
DECLARE
    field_exists boolean;
    archived_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'field'
    ) INTO field_exists;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'field_legacy_removed'
    ) INTO archived_exists;

    IF field_exists AND NOT archived_exists THEN
        ALTER TABLE users RENAME COLUMN field TO field_legacy_removed;
    ELSIF field_exists AND archived_exists THEN
        ALTER TABLE users DROP COLUMN field;
    END IF;
END $$;
