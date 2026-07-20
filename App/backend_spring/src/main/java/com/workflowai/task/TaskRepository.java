package com.workflowai.task;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TaskRepository extends JpaRepository<Task, Long> {
    List<Task> findByProjectIdOrderByStatusAscPositionAsc(Long projectId);

    List<Task> findByProjectIdOrderByCreatedAtDesc(Long projectId);

    Optional<Task> findFirstBySourceMeetingIdAndTitleAndAssigneeIdAndDueDate(
        Long sourceMeetingId,
        String title,
        Long assigneeId,
        LocalDate dueDate
    );

    /** 새 업무를 컬럼 맨 끝에 추가할 때 쓸 기준값(해당 프로젝트+상태에서 가장 큰 position). */
    Optional<Task> findTopByProjectIdAndStatusOrderByPositionDesc(Long projectId, String status);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Task t set t.sourceMeetingId = null where t.sourceMeetingId = :meetingId")
    int clearSourceMeetingId(@Param("meetingId") Long meetingId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from Task t where t.sourceMeetingId = :meetingId")
    int deleteBySourceMeetingId(@Param("meetingId") Long meetingId);
}
