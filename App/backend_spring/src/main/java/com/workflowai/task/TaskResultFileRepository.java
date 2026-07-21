package com.workflowai.task;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskResultFileRepository extends JpaRepository<TaskResultFile, Long> {
    List<TaskResultFile> findByTaskIdOrderByCreatedAtAsc(Long taskId);
}
