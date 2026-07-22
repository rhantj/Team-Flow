package com.workflowai.task;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskResultRepository extends JpaRepository<TaskResult, Long> {
    Optional<TaskResult> findByTaskId(Long taskId);
}
