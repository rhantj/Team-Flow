package com.workflowai.project;

public class ProjectScheduleException extends RuntimeException {
    private final String code;

    public ProjectScheduleException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
