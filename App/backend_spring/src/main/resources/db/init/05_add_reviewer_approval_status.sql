-- ============================================================================
-- 심사자(REVIEWER) 회원가입 승인 상태. additive/idempotent.
-- 기존에 떠 있는 DB에는 수동으로 psql -f 실행 필요.
-- 승인 처리는 관리자 UI가 없으므로 최소 구현으로 직접 SQL로 수행한다:
--   UPDATE users SET reviewer_status = 'APPROVED' WHERE email = '...';
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS reviewer_status VARCHAR(20);
COMMENT ON COLUMN users.reviewer_status IS 'REVIEWER로 가입 신청한 계정만 사용: PENDING(승인 대기)/APPROVED(승인 완료). NULL이면 심사자 신청 이력 없음.';
