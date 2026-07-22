package com.workflowai.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;

class ChecklistApplyServiceTest {

    @Test
    void savesNormalizedTitlesSkippingDuplicatesBlanksAndExisting() {
        ChecklistRepository repo = mock(ChecklistRepository.class);
        when(repo.findByTaskIdOrderByCreatedAtAsc(5L)).thenReturn(List.of(new Checklist(5L, "구현")));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        ChecklistAiService ai = new ChecklistAiService(mock(FastApiChecklistClient.class), new RuleBasedChecklistGenerator());

        ChecklistApplyService service = new ChecklistApplyService(repo, ai);
        List<Checklist> saved = service.saveGenerated(5L, List.of(" API 설계 ", "구현", "", "API 설계"));

        // 트림 후 "API 설계"만 저장(공백/자기중복/기존항목 "구현" 제외)
        assertThat(saved).extracting(Checklist::getTitle).containsExactly("API 설계");
    }

    @Test
    void returnsEmptyWhenAllTitlesInvalid() {
        ChecklistRepository repo = mock(ChecklistRepository.class);
        when(repo.findByTaskIdOrderByCreatedAtAsc(5L)).thenReturn(List.of());
        ChecklistAiService ai = new ChecklistAiService(mock(FastApiChecklistClient.class), new RuleBasedChecklistGenerator());

        ChecklistApplyService service = new ChecklistApplyService(repo, ai);
        assertThat(service.saveGenerated(5L, List.of("  ", ""))).isEmpty();
    }
}
