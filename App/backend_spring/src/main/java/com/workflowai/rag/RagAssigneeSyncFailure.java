package com.workflowai.rag;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "rag_assignee_sync_failures")
public class RagAssigneeSyncFailure {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "source_type", nullable = false)
    private String sourceType;

    @Column(name = "source_id", nullable = false)
    private Long sourceId;

    @Column(name = "assignee_id")
    private Long assigneeId;

    @Column(name = "error_message", columnDefinition = "text")
    private String errorMessage;

    @Column(name = "failed_at", nullable = false)
    private LocalDateTime failedAt;

    protected RagAssigneeSyncFailure() {
    }

    public RagAssigneeSyncFailure(Long projectId, String sourceType, Long sourceId, Long assigneeId, String errorMessage) {
        this.projectId = projectId;
        this.sourceType = sourceType;
        this.sourceId = sourceId;
        this.assigneeId = assigneeId;
        this.errorMessage = errorMessage;
        this.failedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public Long getProjectId() {
        return projectId;
    }

    public String getSourceType() {
        return sourceType;
    }

    public Long getSourceId() {
        return sourceId;
    }

    public Long getAssigneeId() {
        return assigneeId;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public LocalDateTime getFailedAt() {
        return failedAt;
    }
}
