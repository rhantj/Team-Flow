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

    @Column(nullable = false)
    private double position;

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
        Long createdBy,
        double position
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
        this.position = position;
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

    public double getPosition() {
        return position;
    }

    /** 칸반 드래그앤드롭: 카드를 다른 컬럼/다른 위치로 옮긴다. */
    public void moveTo(String status, double position) {
        this.status = status;
        this.position = position;
    }

    /**
     * null인 필드는 변경하지 않는다(부분 수정). updated_at은 DB 트리거(trg_tasks_updated_at)가 갱신한다.
     * 담당자 미배정/마감일 삭제처럼 "명시적으로 null로 비우기"는 아직 어떤 프론트 화면에서도 호출하지 않으므로 지원하지 않는다.
     */
    public void applyUpdate(String title, String category, Long assigneeId, LocalDate dueDate, String priority, String description) {
        if (title != null) this.title = title;
        if (category != null) this.category = category;
        if (assigneeId != null) this.assigneeId = assigneeId;
        if (dueDate != null) this.dueDate = dueDate;
        if (priority != null) this.priority = priority;
        if (description != null) this.description = description;
    }
}
