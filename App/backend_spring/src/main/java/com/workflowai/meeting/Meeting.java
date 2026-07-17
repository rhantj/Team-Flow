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
@Table(name = "meetings")
public class Meeting {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    private String title;

    @Column(name = "file_type", nullable = false)
    private String fileType;

    @Column(name = "file_path")
    private String filePath;

    @Column(name = "analysis_status", nullable = false)
    private String analysisStatus;

    @Column(name = "meeting_date")
    private LocalDate meetingDate;

    @Column(name = "meeting_type")
    private String meetingType;

    @Column(name = "original_file_name")
    private String originalFileName;

    @Column(name = "analysis_error_message", columnDefinition = "text")
    private String analysisErrorMessage;

    @Column(name = "uploaded_by")
    private Long uploadedBy;

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    protected Meeting() {
    }

    public Meeting(
        Long projectId,
        String title,
        String fileType,
        String filePath,
        String analysisStatus,
        LocalDate meetingDate,
        String meetingType,
        String originalFileName,
        Long uploadedBy,
        Long fileSize
    ) {
        this.projectId = projectId;
        this.title = title;
        this.fileType = fileType;
        this.filePath = filePath;
        this.analysisStatus = analysisStatus;
        this.meetingDate = meetingDate;
        this.meetingType = meetingType;
        this.originalFileName = originalFileName;
        this.uploadedBy = uploadedBy;
        this.fileSize = fileSize;
        this.createdAt = LocalDateTime.now();
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

    public String getAnalysisStatus() {
        return analysisStatus;
    }

    public void setAnalysisStatus(String analysisStatus) {
        this.analysisStatus = analysisStatus;
    }

    public String getFilePath() {
        return filePath;
    }

    public void setFilePath(String filePath) {
        this.filePath = filePath;
    }

    public LocalDate getMeetingDate() {
        return meetingDate;
    }

    public String getMeetingType() {
        return meetingType;
    }

    public String getOriginalFileName() {
        return originalFileName;
    }

    public String getFileType() {
        return fileType;
    }

    public String getAnalysisErrorMessage() {
        return analysisErrorMessage;
    }

    public void setAnalysisErrorMessage(String analysisErrorMessage) {
        this.analysisErrorMessage = analysisErrorMessage;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
