-- 회의록 수정본(버전) 제목 중복 방지: 애플리케이션 레벨 비관적 락(FOR UPDATE)만으로는
-- 락 조회 경로에 예외적인 빈틈이 생기면 중복 제목이 만들어질 수 있어, DB 유일성 제약으로
-- 이중 안전장치를 둔다. 같은 원본(original_meeting_id) 아래에서는 제목이 유일해야 한다.

-- 유니크 인덱스 생성이 기존 중복 데이터 때문에 배포 자체를 실패시키지 않도록,
-- 인덱스를 걸기 전에 이미 존재하는 중복 제목을 행별로 유일하게 보정한다.
-- 단순히 title에 id를 붙이면 그 결과 문자열이 우연히 다른 행의 제목과 같을 수 있으므로,
-- 후보 제목이 (original_meeting_id, title) 기준으로 실제 비어 있는지 확인하며 순차 증가시킨다.
-- 데이터는 지우지 않고 제목만 보정한다.
DO $$
DECLARE
    dup RECORD;
    candidate TEXT;
    dup_suffix INT;
BEGIN
    FOR dup IN
        SELECT id, original_meeting_id, title,
               ROW_NUMBER() OVER (PARTITION BY original_meeting_id, title ORDER BY id) AS rn
        FROM meetings
        WHERE original_meeting_id IS NOT NULL
    LOOP
        IF dup.rn > 1 THEN
            dup_suffix := 1;
            LOOP
                candidate := dup.title || '_dup' || dup_suffix;
                EXIT WHEN NOT EXISTS (
                    SELECT 1 FROM meetings
                    WHERE original_meeting_id = dup.original_meeting_id
                      AND title = candidate
                );
                dup_suffix := dup_suffix + 1;
            END LOOP;
            UPDATE meetings SET title = candidate WHERE id = dup.id;
        END IF;
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_meetings_original_id_title
    ON meetings (original_meeting_id, title)
    WHERE original_meeting_id IS NOT NULL;
