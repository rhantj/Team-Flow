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

    @Column(columnDefinition = "text")
    private String transcript;

    @Column(name = "analysis_status", nullable = false)
    private String analysisStatus;

    @Column(name = "meeting_date")
    private LocalDate meetingDate;

    @Column(name = "meeting_type")
    private String meetingType;

    @Column(name = "original_file_name")
    private String originalFileName;

    @Column(name = "uploaded_by")
    private Long uploadedBy;

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "original_meeting_id")
    private Long originalMeetingId;

    @Column(name = "edited_by")
    private Long editedBy;

    @Column(name = "saved_at")
    private LocalDateTime savedAt;

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

    /** 기존 회의록을 원본 훼손 없이 수정할 때 새 버전 레코드를 만든다. 분석 상태는 항상 pending으로 시작한다. */
    public static Meeting newVersion(Meeting original, String transcript, Long editedBy, String versionTitle) {
        Meeting version = new Meeting(
            original.projectId,
            versionTitle,
            original.fileType,
            null,
            "pending",
            original.meetingDate,
            original.meetingType,
            original.originalFileName,
            editedBy,
            null
        );
        version.transcript = transcript;
        version.originalMeetingId = original.originalMeetingId != null ? original.originalMeetingId : original.id;
        version.editedBy = editedBy;
        return version;
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

    public String getTranscript() {
        return transcript;
    }

    public void setTranscript(String transcript) {
        this.transcript = transcript;
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

    public Long getUploadedBy() {
        return uploadedBy;
    }

    public Long getOriginalMeetingId() {
        return originalMeetingId;
    }

    public Long getEditedBy() {
        return editedBy;
    }

    public LocalDateTime getSavedAt() {
        return savedAt;
    }

    /** "저장" 확정 — 분석결과 저장확정 및 수정본 저장 양쪽에서 호출된다. */
    public void markSaved() {
        this.savedAt = LocalDateTime.now();
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
