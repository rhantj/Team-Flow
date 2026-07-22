package com.workflowai.project;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProjectMemberRepository extends JpaRepository<ProjectMember, Long> {
    Optional<ProjectMember> findByProjectIdAndUserId(Long projectId, Long userId);

    boolean existsByProjectIdAndUserId(Long projectId, Long userId);

    List<ProjectMember> findAllByProjectId(Long projectId);

    List<ProjectMember> findAllByUserId(Long userId);

    long countByProjectId(Long projectId);

    @Query("""
        select pm.projectId as projectId, count(pm.id) as memberCount
        from ProjectMember pm
        where pm.projectId in :projectIds
        group by pm.projectId
        """)
    List<ProjectMemberCountView> countMembersByProjectIds(@Param("projectIds") List<Long> projectIds);

    interface ProjectMemberCountView {
        Long getProjectId();

        Long getMemberCount();
    }
}
