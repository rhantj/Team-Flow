-- ============================================================================
-- WorkFlow AI - users.field(레거시) 컬럼 보관 처리 (rename, 즉시 DROP 아님)
--
-- field_tags(08_users_field_tags_column.sql)가 이 컬럼을 완전히 대체했고, 어떤 코드도 더 이상
-- field를 참조하지 않는다. 다만 DROP COLUMN은 실행 즉시 데이터가 영구히 사라져 되돌릴 수 없다 —
-- 만약 field_tags 백필이 실제로는 불완전했거나 배포 순서가 꼬여 뒤늦게 문제를 발견해도 복구할
-- 방법이 없다. 그래서 컬럼을 지우는 대신 field_legacy_removed로 이름만 바꿔 그대로 보관한다.
-- 문제가 생기면 아래 한 줄로 즉시 되돌릴 수 있다:
--     ALTER TABLE users RENAME COLUMN field_legacy_removed TO field;
-- 실제 DROP은 이 상태로 최소 한 배포 주기 이상 문제 없이 운영된 게 확인된 뒤, 별도 마이그레이션에서
-- 수행한다.
--
-- 배포 순서 주의: RENAME도 DROP과 마찬가지로 옛 컬럼명(field)을 참조하는 구버전 인스턴스에는
-- 즉시 오류를 유발한다 — field_tags를 쓰지 않는 구버전 백엔드가 아직 떠 있는 동안 이 스크립트를
-- 먼저 실행하면 안 된다. 모든 인스턴스가 field_tags 기반 코드(현재 버전)로 교체된 뒤에만 실행할 것.
-- 재실행해도 안전하다. 다만 "안전"에는 field가 이미 없는 경우뿐 아니라, 초기화 스크립트
-- 전체를 재실행해 04(users.field ADD COLUMN IF NOT EXISTS)가 field를 다시 만들어낸 뒤 여기가
-- 또 도는 경우까지 포함한다 — 그 상태에서 예전처럼 무조건 RENAME을 시도하면 대상 이름
-- field_legacy_removed가 이미 있어 "column already exists" 오류로 실패한다. 그래서 두 컬럼의
-- 존재 여부를 함께 보고 분기한다: field_legacy_removed가 아직 없으면 정상적으로 rename하고,
-- 이미 있으면(= 과거에 한 번 rename이 끝난 뒤 04가 새로 만들어낸 빈 field일 뿐, 진짜 데이터가
-- 아니다) rename 대신 그 빈 field를 그냥 지운다.
-- ============================================================================

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
