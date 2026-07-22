package com.workflowai.task;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class RuleBasedChecklistGeneratorTest {
    private final RuleBasedChecklistGenerator generator = new RuleBasedChecklistGenerator();

    private Task task(String category, String description) {
        return new Task(
            1L, "제목", category, "todo", null,
            LocalDate.of(2026, 7, 1), "medium", description,
            "MANUAL", null, 1L, 0.0
        );
    }

    @Test
    void usesBackendTemplateForBackendCategory() {
        List<String> items = generator.generate(task("backend", null));
        assertThat(items).containsExactly("API 명세 확정", "예외 처리 작성", "단위 테스트 작성", "Swagger 문서화");
    }

    @Test
    void fallsBackToDefaultTemplateForUnknownCategory() {
        List<String> items = generator.generate(task("unknown-category", null));
        assertThat(items).containsExactly("요구사항 확인", "작업 진행", "결과 검토");
    }

    @Test
    void appendsExtractedSentencesFromDescriptionUpToMaxFive() {
        List<String> items = generator.generate(
            task("qa", "로그인 실패 메시지를 확인한다. 응답 시간을 측정한다.")
        );
        assertThat(items).hasSize(5);
        assertThat(items).contains("테스트 케이스 작성", "기능 테스트 수행", "버그 리포트 작성");
        assertThat(items).contains("로그인 실패 메시지를 확인한다", "응답 시간을 측정한다");
    }

    @Test
    void ignoresBlankDescription() {
        List<String> items = generator.generate(task("docs", "   "));
        assertThat(items).containsExactly("문서 초안 작성", "내용 검토", "최종본 정리");
    }

    @Test
    void ignoresNullDescription() {
        List<String> items = generator.generate(task("presentation", null));
        assertThat(items).containsExactly("발표 목차 구성", "슬라이드 제작", "발표 대본 작성");
    }
}
