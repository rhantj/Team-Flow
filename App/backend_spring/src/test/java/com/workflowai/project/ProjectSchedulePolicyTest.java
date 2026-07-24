package com.workflowai.project;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class ProjectSchedulePolicyTest {
    private static final LocalDate PROJECT_START = LocalDate.of(2026, 7, 10);
    private static final LocalDate PROJECT_END = LocalDate.of(2026, 8, 20);

    @Test
    void acceptsScheduleInsideProjectRange() {
        assertThatCode(() -> ProjectSchedulePolicy.validate(
            PROJECT_START,
            PROJECT_END,
            LocalDate.of(2026, 7, 15),
            LocalDate.of(2026, 8, 1),
            "업무"
        )).doesNotThrowAnyException();
    }

    @Test
    void rejectsScheduleBeforeProjectStart() {
        assertThatThrownBy(() -> ProjectSchedulePolicy.validate(
            PROJECT_START,
            PROJECT_END,
            LocalDate.of(2026, 7, 9),
            LocalDate.of(2026, 7, 15),
            "업무"
        )).isInstanceOf(ProjectScheduleException.class)
            .extracting("code")
            .isEqualTo("SCHEDULE_OUTSIDE_PROJECT");
    }

    @Test
    void rejectsScheduleAfterProjectDeadline() {
        assertThatThrownBy(() -> ProjectSchedulePolicy.validate(
            PROJECT_START,
            PROJECT_END,
            LocalDate.of(2026, 8, 1),
            LocalDate.of(2026, 8, 21),
            "마일스톤"
        )).isInstanceOf(ProjectScheduleException.class)
            .hasMessageContaining("2026-07-10 ~ 2026-08-20");
    }
}
