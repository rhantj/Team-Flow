package com.workflowai.task;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "tasks")
public class Task {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private String status;

    @Column(name = "assignee_id")
    private Long assigneeId;

    @Column(name = "due_date")
    private LocalDate dueDate;

    private String priority;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "source_type")
    private String sourceType;

    @Column(name = "source_meeting_id")
    private Long sourceMeetingId;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected Task() {
    }

    public Task(
        Long projectId,
        String title,
        String category,
        String status,
        Long assigneeId,
        LocalDate dueDate,
        String priority,
        String description,
        String sourceType,
        Long sourceMeetingId,
        Long createdBy
    ) {
        this.projectId = projectId;
        this.title = title;
        this.category = category;
        this.status = status;
        this.assigneeId = assigneeId;
        this.dueDate = dueDate;
        this.priority = priority;
        this.description = description;
        this.sourceType = sourceType;
        this.sourceMeetingId = sourceMeetingId;
        this.createdBy = createdBy;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public Long getProjectId() {
        return projectId;
    }

    public String getTitle() {
        return title;
    }

    public String getCategory() {
        return category;
    }

    public String getStatus() {
        return status;
    }

    public Long getAssigneeId() {
        return assigneeId;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public String getPriority() {
        return priority;
    }

    public String getDescription() {
        return description;
    }

    public String getSourceType() {
        return sourceType;
    }

    public Long getSourceMeetingId() {
        return sourceMeetingId;
    }
}
