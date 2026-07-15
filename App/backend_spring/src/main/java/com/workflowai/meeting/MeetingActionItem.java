package com.workflowai.meeting;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "meeting_action_items")
public class MeetingActionItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "meeting_id", nullable = false)
    private Long meetingId;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    private String category;

    @Column(name = "recommended_assignee_id")
    private Long recommendedAssigneeId;

    @Column(name = "final_assignee_id")
    private Long finalAssigneeId;

    @Column(name = "due_date")
    private LocalDate dueDate;

    private String priority;

    @Column(columnDefinition = "text")
    private String basis;

    @Column(nullable = false)
    private boolean approved;

    @Column(name = "created_task_id")
    private Long createdTaskId;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    protected MeetingActionItem() {
    }

    public MeetingActionItem(
        Long meetingId,
        String title,
        String description,
        String category,
        Long recommendedAssigneeId,
        Long finalAssigneeId,
        LocalDate dueDate,
        String priority,
        String basis
    ) {
        this.meetingId = meetingId;
        this.title = title;
        this.description = description;
        this.category = category;
        this.recommendedAssigneeId = recommendedAssigneeId;
        this.finalAssigneeId = finalAssigneeId;
        this.dueDate = dueDate;
        this.priority = priority;
        this.basis = basis;
        this.approved = false;
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public Long getMeetingId() {
        return meetingId;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public String getCategory() {
        return category;
    }

    public Long getRecommendedAssigneeId() {
        return recommendedAssigneeId;
    }

    public String getPriority() {
        return priority;
    }

    public String getBasis() {
        return basis;
    }

    public Long getFinalAssigneeId() {
        return finalAssigneeId;
    }

    public void setFinalAssigneeId(Long finalAssigneeId) {
        this.finalAssigneeId = finalAssigneeId;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }

    public boolean isApproved() {
        return approved;
    }

    public void setApproved(boolean approved) {
        this.approved = approved;
    }

    public Long getCreatedTaskId() {
        return createdTaskId;
    }

    public void setCreatedTaskId(Long createdTaskId) {
        this.createdTaskId = createdTaskId;
    }
}
