package com.workflowai.evaluation;

import java.math.BigDecimal;

public record EvaluationScoreResponse(
    Long projectId,
    Long userId,
    BigDecimal score,
    boolean isPublic,
    BigDecimal reviewerScore,
    String grade
) {
    static EvaluationScoreResponse from(EvaluationScore entity) {
        return new EvaluationScoreResponse(
            entity.getProjectId(),
            entity.getUserId(),
            entity.getScore(),
            entity.isPublic(),
            entity.getReviewerScore(),
            entity.getGrade()
        );
    }
}
