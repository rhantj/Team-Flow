package com.workflowai.meeting;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MeetingAttendeeRepository extends JpaRepository<MeetingAttendee, Long> {
    List<MeetingAttendee> findByMeetingId(Long meetingId);

    List<MeetingAttendee> findByMeetingIdIn(List<Long> meetingIds);

    void deleteByMeetingId(Long meetingId);
}
