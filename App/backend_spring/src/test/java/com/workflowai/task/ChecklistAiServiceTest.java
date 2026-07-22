package com.workflowai.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.workflowai.task.ChecklistAiDtos.AiChecklistItem;
import com.workflowai.task.ChecklistAiDtos.ChecklistGenerateAiResponse;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class ChecklistAiServiceTest {

    private Task task(String category) {
        return new Task(1L, "로그인 API", category, "todo", null, LocalDate.parse("2026-08-01"),
            "HIGH", "설명", null, null, 1L, 0.0);
    }

    @Test
    void usesAiTitlesAndEngineWhenClientSucceeds() {
        FastApiChecklistClient client = mock(FastApiChecklistClient.class);
        when(client.generate(any())).thenReturn(new ChecklistGenerateAiResponse(
            List.of(new AiChecklistItem("API 설계", "근거"), new AiChecklistItem("구현", "근거")), "ollama"));

        ChecklistAiService service = new ChecklistAiService(client, new RuleBasedChecklistGenerator());
        ChecklistPreviewResult result = service.generatePreview(task("backend"), List.of());

        assertThat(result.engine()).isEqualTo("ollama");
        assertThat(result.titles()).containsExactly("API 설계", "구현");
    }

    @Test
    void fallsBackToRuleBasedWhenClientThrows() {
        FastApiChecklistClient client = mock(FastApiChecklistClient.class);
        when(client.generate(any())).thenThrow(new RuntimeException("connection refused"));

        ChecklistAiService service = new ChecklistAiService(client, new RuleBasedChecklistGenerator());
        ChecklistPreviewResult result = service.generatePreview(task("backend"), List.of());

        assertThat(result.engine()).isEqualTo("rule-based");
        assertThat(result.titles()).isNotEmpty();  // RuleBased backend 템플릿
    }

    @Test
    void removesDuplicatesExistingAndBlanks() {
        FastApiChecklistClient client = mock(FastApiChecklistClient.class);
        when(client.generate(any())).thenReturn(new ChecklistGenerateAiResponse(
            List.of(new AiChecklistItem("API 설계", ""), new AiChecklistItem(" API 설계 ", ""),
                new AiChecklistItem("구현", ""), new AiChecklistItem("  ", "")), "ollama"));

        ChecklistAiService service = new ChecklistAiService(client, new RuleBasedChecklistGenerator());
        ChecklistPreviewResult result = service.generatePreview(task("backend"), List.of("구현"));

        assertThat(result.titles()).containsExactly("API 설계");
    }

    @Test
    void normalizeTitlesDropsBlanksDuplicatesAndExisting() {
        ChecklistAiService service = new ChecklistAiService(mock(FastApiChecklistClient.class), new RuleBasedChecklistGenerator());
        assertThat(service.normalizeTitles(List.of(" 설계 ", "설계", "", "구현"), List.of("구현")))
            .containsExactly("설계");
    }
}
