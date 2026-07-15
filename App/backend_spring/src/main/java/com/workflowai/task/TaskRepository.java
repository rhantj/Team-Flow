package com.workflowai.task;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskRepository extends JpaRepository<Task, Long> {
    List<Task> findByProjectIdOrderByCreatedAtDesc(Long projectId);

    Optional<Task> findFirstBySourceMeetingIdAndTitleAndAssigneeIdAndDueDate(
        Long sourceMeetingId,
        String title,
        Long assigneeId,
        LocalDate dueDate
    );
}
