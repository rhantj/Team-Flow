package com.workflowai.evaluation;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;

/**
 * 심사자가 팀원 최종 평가 점수를 확정/수정할 때 쓰는 요청.
 * score/reviewerScore/grade는 모두 "null이면 기존 값을 유지"하는 정책이다 —
 * 공개 여부만 토글할 때는 score를 아예 보내지 않아야 학점 계산기가 저장한 값을 덮어쓰지 않는다.
 */
public record EvaluationScoreRequest(
    @NotNull Long projectId,
    @NotNull Long userId,
    @DecimalMin("0") @DecimalMax("100") BigDecimal score,
    boolean isPublic,
    @DecimalMin("0") @DecimalMax("100") BigDecimal reviewerScore,
    @Pattern(regexp = "^(A\\+|A0|A-|B\\+|B0|B-|C\\+|C0|C-|D\\+|D0|D-|F|P|NP)$", message = "학점 형식이 올바르지 않습니다.")
    String grade
) {}
