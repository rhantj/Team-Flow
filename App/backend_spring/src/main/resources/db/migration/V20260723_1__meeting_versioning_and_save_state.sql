-- 회의록 AI 고도화: 버전 관리(수정본) + 저장 확정 상태 추가

ALTER TABLE meetings
    ADD COLUMN IF NOT EXISTS original_meeting_id BIGINT NULL,
    ADD COLUMN IF NOT EXISTS edited_by            BIGINT NULL,
    ADD COLUMN IF NOT EXISTS saved_at             TIMESTAMP NULL,
    ADD COLUMN IF NOT EXISTS transcript           TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_meetings_original'
    ) THEN
        ALTER TABLE meetings ADD CONSTRAINT fk_meetings_original
            FOREIGN KEY (original_meeting_id) REFERENCES meetings(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_meetings_edited_by'
    ) THEN
        ALTER TABLE meetings ADD CONSTRAINT fk_meetings_edited_by
            FOREIGN KEY (edited_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN meetings.original_meeting_id IS '이 레코드가 수정본이면 원본 회의록 id (원본 자신은 NULL)';
COMMENT ON COLUMN meetings.edited_by IS '이 버전을 수정/생성한 사용자 (원본에는 NULL)';
COMMENT ON COLUMN meetings.saved_at IS '분석결과 저장 확정 또는 수정본 저장 시각 (NULL이면 아직 저장 확정 전)';
