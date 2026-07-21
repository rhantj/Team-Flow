-- Existing deployments do not re-run docker-entrypoint-initdb.d scripts.
-- Keep these changes additive/idempotent so Flyway can apply them before JPA validation.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reviewer_status VARCHAR(20);

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
