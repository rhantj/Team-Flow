package com.workflowai.project;

public enum ProjectRole {
    LEADER, MEMBER, REVIEWER;

    public String toKorean() {
        return switch (this) {
            case LEADER -> "팀장";
            case MEMBER -> "팀원";
            case REVIEWER -> "심사자";
        };
    }

    public static ProjectRole fromKorean(String value) {
        return switch (value) {
            case "팀장" -> LEADER;
            case "팀원" -> MEMBER;
            case "심사자" -> REVIEWER;
            default -> throw new IllegalArgumentException("알 수 없는 역할입니다: " + value);
        };
    }
}
