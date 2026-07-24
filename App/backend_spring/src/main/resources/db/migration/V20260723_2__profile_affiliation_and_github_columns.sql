-- WorkFlow AI - affiliation/github_username 컬럼을 Flyway로도 보장한다.
--
-- User 엔티티가 매핑하는 이 두 컬럼은 지금까지 db/init(04_user_profile_fields.sql)과
-- docs/db/migrations(006_users_profile_fields.sql)로만 적용돼 왔고 Flyway 마이그레이션에는
-- 없었다 — V20260723_1(field_tags/profile_image_path)과 같은 이유로, db/init을 거치지
-- 않았거나 해당 docs/db/migrations 파일을 아직 수동 적용하지 못한 DB가 Flyway만으로
-- baseline을 잡으면 이 컬럼들의 부재를 알아채지 못해 JPA ddl-auto=validate가 기동 시점에
-- 실패할 수 있었다.
--
-- 레거시 field(VARCHAR) 컬럼은 여기서 다시 만들지 않는다 — User 엔티티는 field_tags만
-- 매핑하고(V20260723_1이 담당), field는 어떤 현재 코드도 참조하지 않는 완전한 레거시라 새
-- 환경에 새삼 만들 이유가 없다.

ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliation VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_username VARCHAR(100);

COMMENT ON COLUMN users.affiliation IS '소속 (예: 컴퓨터공학과 3학년)';
COMMENT ON COLUMN users.github_username IS 'GitHub 아이디만 저장한다 (URL 아님). 표시 시 github.com/{username} 형태로 조합';
