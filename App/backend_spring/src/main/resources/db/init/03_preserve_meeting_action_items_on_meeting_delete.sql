-- 회의록만 삭제할 때 To-Do 후보(meeting_action_items)는 보존하고 원본 회의록 연결만 비운다.
-- 기존 스키마는 meetings 삭제 시 meeting_action_items도 CASCADE 삭제되므로 SET NULL로 변경한다.

ALTER TABLE meeting_action_items
    ALTER COLUMN meeting_id DROP NOT NULL;

ALTER TABLE meeting_action_items
    DROP CONSTRAINT IF EXISTS fk_action_items_meeting;

ALTER TABLE meeting_action_items
    ADD CONSTRAINT fk_action_items_meeting
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL;
