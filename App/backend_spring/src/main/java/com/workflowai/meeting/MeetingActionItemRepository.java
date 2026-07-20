package com.workflowai.meeting;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MeetingActionItemRepository extends JpaRepository<MeetingActionItem, Long> {
    List<MeetingActionItem> findByMeetingId(Long meetingId);

    Optional<MeetingActionItem> findFirstByMeetingIdAndTitle(Long meetingId, String title);

    void deleteByMeetingId(Long meetingId);

    @Modifying
    @Query("update MeetingActionItem item set item.meetingId = null where item.meetingId = :meetingId")
    int clearMeetingId(@Param("meetingId") Long meetingId);
}
