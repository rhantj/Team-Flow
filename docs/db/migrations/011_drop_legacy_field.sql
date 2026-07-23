-- users.field(레거시) 컬럼 보관 처리 (rename, 즉시 DROP 아님).
--
-- field_tags(010_users_field_tags_column.sql)가 이 컬럼을 완전히 대체했고, 어떤 코드도 더 이상
-- field를 참조하지 않는다. 다만 DROP COLUMN은 실행 즉시 데이터가 영구히 사라져 되돌릴 수 없다 —
-- 만약 field_tags 백필이 실제로는 불완전했거나 배포 순서가 꼬여 뒤늦게 문제를 발견해도 복구할
-- 방법이 없다. 그래서 컬럼을 지우는 대신 field_legacy_removed로 이름만 바꿔 그대로 보관한다.
--
-- 되돌리는 방법: 보통은(field가 다시 생기지 않은 상태) 아래 한 줄로 즉시 되돌릴 수 있다.
--     ALTER TABLE users RENAME COLUMN field_legacy_removed TO field;
-- 다만 마이그레이션 전체를 재실행해 006이 field를 다시 만들어낸 상태라면 이름이 이미 차 있어
-- 이 한 줄이 그대로는 실패한다 — 아래 재실행 안전성 설명과 field_needs_manual_review를 먼저
-- 확인할 것.
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
-- 즉 이 파일도 매 배포마다 재실행된다는 뜻이다. 이때 006(ADD COLUMN IF NOT EXISTS)이 field를
-- 다시 만들어낸 뒤 이 스크립트가 또 돌 수 있다. field_legacy_removed가 이미 있어 예전처럼
-- 무조건 RENAME을 시도하면 "column already exists"로 실패한다. 그렇다고 field를 무조건
-- DROP하는 것도 위험하다 — 그 사이 구버전으로 롤백된 인스턴스가 field에 실제 값을 다시
-- 기록했을 수 있기 때문이다(field가 재생성된 뒤에는 구버전 엔티티 매핑과 다시 맞아떨어져
-- 정상적으로 쓰기가 가능해진다). 그래서 세 갈래로 나눈다:
--   1) field만 있고 field_legacy_removed가 없으면 → 첫 rename (정상 케이스)
--   2) 둘 다 있고 field가 전부 NULL이면 → 006이 방금 만들어낸 빈 컬럼일 뿐이므로 그냥 DROP
--   3) 둘 다 있고 field에 값이 남아있으면 → 데이터를 절대 버리지 않는다. field_legacy_removed로는
--      이름이 겹쳐 rename할 수 없으므로 field_needs_manual_review로 옮겨 보관하고 WARNING을
--      남긴다. field_tags로 수동 병합할지 사람이 검토해야 한다.

DO $$
DECLARE
    field_exists boolean;
    archived_exists boolean;
    escape_exists boolean;
    field_has_data boolean;
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
        RETURN;
    END IF;

    IF NOT field_exists THEN
        RETURN;
    END IF;

    SELECT EXISTS (SELECT 1 FROM users WHERE field IS NOT NULL) INTO field_has_data;

    IF NOT field_has_data THEN
        ALTER TABLE users DROP COLUMN field;
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'field_needs_manual_review'
    ) INTO escape_exists;

    IF escape_exists THEN
        RAISE WARNING 'users.field에 값이 남아있지만 field_needs_manual_review도 이미 존재해 자동으로 보관하지 못했습니다. users.field를 직접 검토하세요.';
    ELSE
        ALTER TABLE users RENAME COLUMN field TO field_needs_manual_review;
        RAISE WARNING 'users.field에 값이 남아있어 자동으로 지우지 않고 field_needs_manual_review로 보관했습니다. 구버전으로 롤백된 동안 새로 기록된 데이터일 수 있으니 field_tags로 수동 병합할지 검토한 뒤 처리하세요.';
    END IF;
END $$;
