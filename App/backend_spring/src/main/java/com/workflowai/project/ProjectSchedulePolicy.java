package com.workflowai.project;

import java.time.LocalDate;

public final class ProjectSchedulePolicy {
    private ProjectSchedulePolicy() {
    }

    public static void validate(Project project, LocalDate startDate, LocalDate dueDate, String scheduleName) {
        validate(project.getStartDate(), project.getDeadline(), startDate, dueDate, scheduleName);
    }

    public static void validate(
        LocalDate projectStart,
        LocalDate projectDeadline,
        LocalDate startDate,
        LocalDate dueDate,
        String scheduleName
    ) {
        if (startDate != null && dueDate != null && startDate.isAfter(dueDate)) {
            throw new ProjectScheduleException(
                "INVALID_DATE_RANGE",
                scheduleName + " 시작일은 마감일보다 늦을 수 없습니다."
            );
        }
        if (projectStart != null
            && ((startDate != null && startDate.isBefore(projectStart))
                || (dueDate != null && dueDate.isBefore(projectStart)))) {
            throw outsideProject(scheduleName, projectStart, projectDeadline);
        }
        if (projectDeadline != null
            && ((startDate != null && startDate.isAfter(projectDeadline))
                || (dueDate != null && dueDate.isAfter(projectDeadline)))) {
            throw outsideProject(scheduleName, projectStart, projectDeadline);
        }
    }

    private static ProjectScheduleException outsideProject(
        String scheduleName,
        LocalDate projectStart,
        LocalDate projectDeadline
    ) {
        String range = (projectStart == null ? "미정" : projectStart)
            + " ~ " + (projectDeadline == null ? "미정" : projectDeadline);
        return new ProjectScheduleException(
            "SCHEDULE_OUTSIDE_PROJECT",
            scheduleName + " 일정은 프로젝트 기간(" + range + ") 안에 있어야 합니다."
        );
    }
}
