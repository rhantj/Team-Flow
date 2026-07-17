package com.workflowai.meeting;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "meeting_attendees")
public class MeetingAttendee {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "meeting_id", nullable = false)
    private Long meetingId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    protected MeetingAttendee() {
    }

    public MeetingAttendee(Long meetingId, Long userId) {
        this.meetingId = meetingId;
        this.userId = userId;
    }

    public Long getId() {
        return id;
    }

    public Long getMeetingId() {
        return meetingId;
    }

    public Long getUserId() {
        return userId;
    }
}
