package com.workflowai.meeting;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class FallbackMeetingAnalyzerTest {

    private final FallbackMeetingAnalyzer analyzer = new FallbackMeetingAnalyzer();

    @Test
    void extractsAssigneeCandidateFromMeetingTextInsteadOfRotatingAttendees() {
        AiAnalyzeRequest request = new AiAnalyzeRequest(
            "demo-project",
            "정기회의",
            "2026-07-15",
            "정기회의",
            "document",
            "notes.txt",
            "유소은은 API 문서를 정리한다. 김민준이 발표자료를 작성한다.",
            List.of("김민준", "이서연", "박지수", "최동혁")
        );

        MeetingAnalysisResult result = analyzer.analyze(request);

        List<String> candidates = result.todos().stream().map(MeetingTodo::assignee_candidate).toList();
        assertThat(candidates).contains("유소은", "김민준");
    }

    @Test
    void leavesAssigneeCandidateEmptyWhenNoNameIsWrittenInText() {
        AiAnalyzeRequest request = new AiAnalyzeRequest(
            "demo-project",
            "정기회의",
            "2026-07-15",
            "정기회의",
            "document",
            "notes.txt",
            "발표자료 초안 작성 논의를 진행했다.",
            List.of("김민준", "이서연")
        );

        MeetingAnalysisResult result = analyzer.analyze(request);

        assertThat(result.todos()).isNotEmpty();
        assertThat(result.todos().get(0).assignee_candidate()).isEmpty();
    }
}
