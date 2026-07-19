package com.workflowai.meeting;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MeetingRepository extends JpaRepository<Meeting, Long> {
    List<Meeting> findByProjectIdOrderByCreatedAtDesc(Long projectId);

    Optional<Meeting> findByIdAndProjectId(Long id, Long projectId);
}
