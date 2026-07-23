package com.workflowai.rag;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

public interface RagAssigneeSyncFailureRepository extends JpaRepository<RagAssigneeSyncFailure, Long> {
    List<RagAssigneeSyncFailure> findTop100BySourceTypeStartingWithOrderByFailedAtAsc(String sourceTypePrefix);

    List<RagAssigneeSyncFailure> findByProjectIdAndSourceTypeAndSourceId(
        Long projectId,
        String sourceType,
        Long sourceId
    );

    @Transactional
    long deleteByProjectIdAndSourceTypeAndSourceId(Long projectId, String sourceType, Long sourceId);

    @Transactional
    long deleteByProjectIdAndSourceTypeStartingWith(Long projectId, String sourceTypePrefix);
}
