package com.workflowai.task;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskRepository extends JpaRepository<Task, Long> {
    List<Task> findByProjectIdOrderByStatusAscPositionAsc(Long projectId);

    Optional<Task> findFirstBySourceMeetingIdAndTitleAndAssigneeIdAndDueDate(
        Long sourceMeetingId,
        String title,
        Long assigneeId,
        LocalDate dueDate
    );

    /** 새 업무를 컬럼 맨 끝에 추가할 때 쓸 기준값(해당 프로젝트+상태에서 가장 큰 position). */
    Optional<Task> findTopByProjectIdAndStatusOrderByPositionDesc(Long projectId, String status);
}
