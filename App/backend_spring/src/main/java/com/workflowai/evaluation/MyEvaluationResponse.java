package com.workflowai.evaluation;

import java.math.BigDecimal;

/** 팀원 본인이 마이페이지에서 조회하는 공개된 평가 결과. 공개 전에는 항상 revealed=false, score=null. */
public record MyEvaluationResponse(boolean revealed, BigDecimal score) {
    static MyEvaluationResponse notRevealed() {
        return new MyEvaluationResponse(false, null);
    }

    static MyEvaluationResponse from(EvaluationScore entity) {
        if (!entity.isPublic()) {
            return notRevealed();
        }
        return new MyEvaluationResponse(true, entity.getScore());
    }
}
