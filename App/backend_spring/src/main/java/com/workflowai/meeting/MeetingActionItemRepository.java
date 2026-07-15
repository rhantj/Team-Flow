package com.workflowai.meeting;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MeetingActionItemRepository extends JpaRepository<MeetingActionItem, Long> {
    List<MeetingActionItem> findByMeetingId(Long meetingId);

    Optional<MeetingActionItem> findFirstByMeetingIdAndTitle(Long meetingId, String title);
}
