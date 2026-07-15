package com.workflowai.meeting;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MeetingRepository extends JpaRepository<Meeting, Long> {
    List<Meeting> findByProjectIdOrderByCreatedAtDesc(Long projectId);
}
