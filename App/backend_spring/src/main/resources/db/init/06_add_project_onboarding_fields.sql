-- ============================================================================
-- 프로젝트 생성 온보딩(유형/일정/인원/산출물/기술스택/목표/초대코드) 지원 컬럼.
-- additive/idempotent. 기존에 떠 있는 DB에는 수동으로 psql -f 실행 필요
-- (docker-entrypoint-initdb.d는 볼륨이 비어있을 때만 자동 실행됨).
-- ============================================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS mid_check_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS member_limit INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deliverables JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tech_stack JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS goals TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS invite_code VARCHAR(20);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_projects_invite_code'
    ) THEN
        ALTER TABLE projects ADD CONSTRAINT uq_projects_invite_code UNIQUE (invite_code);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_created_by'
    ) THEN
        ALTER TABLE projects ADD CONSTRAINT fk_projects_created_by
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN projects.mid_check_date IS '중간 점검/중간보고일 (선택)';
COMMENT ON COLUMN projects.member_limit IS '예상 참여 인원 수';
COMMENT ON COLUMN projects.deliverables IS '목표 산출물 목록 (예: ["발표자료","보고서"])';
COMMENT ON COLUMN projects.tech_stack IS '기술 스택/주요 기능 키워드 목록';
COMMENT ON COLUMN projects.goals IS '진행 목표/간단 메모';
COMMENT ON COLUMN projects.invite_code IS '초대 코드 (온보딩 시 자동 생성)';
COMMENT ON COLUMN projects.created_by IS '생성자 user id';
