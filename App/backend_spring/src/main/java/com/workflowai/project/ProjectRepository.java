package com.workflowai.project;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProjectRepository extends JpaRepository<Project, Long> {
    @Query("select p from Project p join ProjectMember pm on pm.projectId = p.id where pm.userId = :userId")
    List<Project> findAllByMemberUserId(@Param("userId") Long userId);

    Optional<Project> findFirstByTitle(String title);
}
