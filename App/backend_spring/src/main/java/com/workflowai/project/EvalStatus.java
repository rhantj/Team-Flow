package com.workflowai.project;

public enum EvalStatus {
    PENDING, EVALUATING, DONE, PUBLISHED;

    /** 프론트엔드 MyPage.tsx의 EvalStatus 타입("pending"|"evaluating"|"done"|"published")과 맞춘 변환. */
    public String toJson() {
        return switch (this) {
            case PENDING -> "pending";
            case EVALUATING -> "evaluating";
            case DONE -> "done";
            case PUBLISHED -> "published";
        };
    }
}
