package com.workflowai.dashboard.repository;

import com.workflowai.dashboard.entity.MlPrediction;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MlPredictionRepository extends JpaRepository<MlPrediction, Long> {

    // target_id별 최신 예측만 골라야 하므로, targetId로 묶고 그 안에서 createdAt 내림차순으로 정렬해
    // 서비스 계층에서 각 targetId의 첫 번째 행만 취하는 방식으로 "최신 예측"을 뽑아낸다.
    List<MlPrediction> findByProjectIdAndTargetTypeAndModelTypeOrderByTargetIdAscCreatedAtDesc(
        Long projectId, String targetType, String modelType
    );
}
