-- 회의록 수정본(버전) 제목 중복 방지: 애플리케이션 레벨 비관적 락(FOR UPDATE)만으로는
-- 락 조회 경로에 예외적인 빈틈이 생기면 중복 제목이 만들어질 수 있어, DB 유일성 제약으로
-- 이중 안전장치를 둔다. 같은 원본(original_meeting_id) 아래에서는 제목이 유일해야 한다.

-- 기존 사용자 데이터(제목)를 마이그레이션이 임의로 바꾸는 것은 그 자체로 파괴적 변경이므로,
-- 자동 보정(rename)은 하지 않는다. 대신 유니크 인덱스를 걸기 전에 중복 여부만 확인하고,
-- 중복이 있으면 배포를 막고 사람이 직접 검토·정리하도록 예외를 던진다.
DO $$
DECLARE
    dup_count INT;
BEGIN
    SELECT COUNT(*) INTO dup_count FROM (
        SELECT original_meeting_id, title
        FROM meetings
        WHERE original_meeting_id IS NOT NULL
        GROUP BY original_meeting_id, title
        HAVING COUNT(*) > 1
    ) duplicated_groups;

    IF dup_count > 0 THEN
        RAISE EXCEPTION '중복된 (original_meeting_id, title) 조합이 %건 있습니다. 데이터를 임의로 변경하지 않으므로, 직접 확인 후 정리하고 이 마이그레이션을 다시 적용하세요.', dup_count;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_meetings_original_id_title
    ON meetings (original_meeting_id, title)
    WHERE original_meeting_id IS NOT NULL;
