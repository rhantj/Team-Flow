package com.workflowai.task;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChecklistRepository extends JpaRepository<Checklist, Long> {
    List<Checklist> findByTaskIdOrderByCreatedAtAsc(Long taskId);
}
