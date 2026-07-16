package com.workflowai.task;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "task_checklists")
public class Checklist {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false)
    private Long taskId;

    @Column(nullable = false)
    private String title;

    @Column(name = "is_done", nullable = false)
    private boolean done;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    protected Checklist() {
    }

    public Checklist(Long taskId, String title) {
        this.taskId = taskId;
        this.title = title;
        this.done = false;
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public Long getTaskId() {
        return taskId;
    }

    public String getTitle() {
        return title;
    }

    public boolean isDone() {
        return done;
    }

    /** null인 필드는 변경하지 않는다(부분 수정). */
    public void applyUpdate(String title, Boolean done) {
        if (title != null) this.title = title;
        if (done != null) this.done = done;
    }
}
