package com.workflowai.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.util.List;
import org.junit.jupiter.api.Test;

class FastApiChecklistClientTest {

    @Test
    void constructsWithBaseUrlWithoutError() {
        assertThatCode(() -> new FastApiChecklistClient("http://localhost:8000")).doesNotThrowAnyException();
    }

    @Test
    void requestRecordExposesSnakeCaseFields() {
        var req = new ChecklistAiDtos.ChecklistGenerateAiRequest(
            "로그인 API", "설명", "backend", "HIGH", "2026-08-01", List.of("API 설계"));
        assertThat(req.existing_items()).containsExactly("API 설계");
        assertThat(req.due_date()).isEqualTo("2026-08-01");
    }
}
