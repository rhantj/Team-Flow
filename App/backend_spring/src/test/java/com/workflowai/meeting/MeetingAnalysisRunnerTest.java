package com.workflowai.meeting;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class MeetingAnalysisRunnerTest {

    @Mock private FastApiMeetingClient fastApiMeetingClient;
    @Mock private FallbackMeetingAnalyzer fallbackMeetingAnalyzer;
    @Mock private MeetingAnalysisPersistence meetingAnalysisPersistence;

    private final AiAnalyzeRequest request = new AiAnalyzeRequest(
        "demo-project", "정기회의", "2026-07-15", "정기회의", "document", "a.txt", "내용", List.of("김민준")
    );

    private MeetingAnalysisRunner newRunner() {
        return new MeetingAnalysisRunner(fastApiMeetingClient, fallbackMeetingAnalyzer, meetingAnalysisPersistence);
    }

    @Test
    void savesSuccessWithFastApiSourceWhenFastApiSucceeds() {
        MeetingAnalysisResult result = new MeetingAnalysisResult(
            "요약", List.of(), List.of(), List.of(), List.of(), new MeetingMeta("정기회의", "2026-07-15", List.of())
        );
        when(fastApiMeetingClient.analyze(request)).thenReturn(result);

        newRunner().runAnalysis(9L, request);

        verify(meetingAnalysisPersistence).saveAnalysisSuccess(9L, result, "FASTAPI");
        verify(meetingAnalysisPersistence, never()).saveAnalysisFailure(any(), any());
    }

    @Test
    void fallsBackToSpringAnalyzerWhenFastApiThrows() {
        MeetingAnalysisResult fallbackResult = new MeetingAnalysisResult(
            "요약", List.of(), List.of(), List.of(), List.of(), new MeetingMeta("정기회의", "2026-07-15", List.of())
        );
        when(fastApiMeetingClient.analyze(request)).thenThrow(new RuntimeException("연결 실패"));
        when(fallbackMeetingAnalyzer.analyze(request)).thenReturn(fallbackResult);

        newRunner().runAnalysis(9L, request);

        verify(meetingAnalysisPersistence).saveAnalysisSuccess(9L, fallbackResult, "SPRING_FALLBACK");
    }

    @Test
    void savesFailureWhenBothFastApiAndFallbackThrow() {
        when(fastApiMeetingClient.analyze(request)).thenThrow(new RuntimeException("연결 실패"));
        when(fallbackMeetingAnalyzer.analyze(request)).thenThrow(new RuntimeException("fallback 실패"));

        newRunner().runAnalysis(9L, request);

        verify(meetingAnalysisPersistence).saveAnalysisFailure(9L, "fallback 실패");
    }
}
