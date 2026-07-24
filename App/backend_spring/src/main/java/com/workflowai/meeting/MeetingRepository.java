package com.workflowai.meeting;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MeetingRepository extends JpaRepository<Meeting, Long> {
    List<Meeting> findByProjectIdOrderByCreatedAtDesc(Long projectId);

    Optional<Meeting> findByIdAndProjectId(Long id, Long projectId);

    long countByOriginalMeetingId(Long originalMeetingId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select meeting from Meeting meeting where meeting.id = :id")
    Optional<Meeting> findByIdForUpdate(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select meeting from Meeting meeting where meeting.id = :id and meeting.projectId = :projectId")
    Optional<Meeting> findByIdAndProjectIdForUpdate(
        @Param("id") Long id,
        @Param("projectId") Long projectId
    );
}
