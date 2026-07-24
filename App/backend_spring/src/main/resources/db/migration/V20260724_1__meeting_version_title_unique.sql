-- 회의록 수정본(버전) 제목 중복 방지: 애플리케이션 레벨 비관적 락(FOR UPDATE)만으로는
-- 락 조회 경로에 예외적인 빈틈이 생기면 중복 제목이 만들어질 수 있어, DB 유일성 제약으로
-- 이중 안전장치를 둔다. 같은 원본(original_meeting_id) 아래에서는 제목이 유일해야 한다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_meetings_original_id_title
    ON meetings (original_meeting_id, title)
    WHERE original_meeting_id IS NOT NULL;
