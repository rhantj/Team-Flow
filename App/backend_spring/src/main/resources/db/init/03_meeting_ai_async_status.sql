-- ============================================================================
-- WorkFlow AI - 회의록 AI 비동기 분석 상태 확장 (2026-07-15)
-- 02_meeting_ai_additions.sql 이후 실행. analysis_status가 failed일 때
-- 실패 사유를 저장하기 위한 컬럼을 추가한다.
-- ============================================================================

ALTER TABLE meetings
    ADD COLUMN IF NOT EXISTS analysis_error_message TEXT;

COMMENT ON COLUMN meetings.analysis_error_message IS '분석 실패(failed) 시 실패 사유 (FastAPI/fallback 예외 메시지)';
