-- Existing deployments do not re-run docker-entrypoint-initdb.d scripts.
-- Keep these changes additive/idempotent so Flyway can apply them before JPA validation.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS eval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
COMMENT ON COLUMN projects.eval_status IS '심사자 평가 상태: PENDING/EVALUATING/DONE/PUBLISHED';
