package com.workflowai.task;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskResultLinkRepository extends JpaRepository<TaskResultLink, Long> {
    List<TaskResultLink> findByTaskIdOrderByCreatedAtAsc(Long taskId);
}
