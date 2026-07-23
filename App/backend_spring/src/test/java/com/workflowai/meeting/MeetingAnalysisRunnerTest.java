package com.workflowai.meeting;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;
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
    private final UUID jobId = UUID.randomUUID();

    private MeetingAnalysisRunner newRunner() {
        when(meetingAnalysisPersistence.claimJob(9L, jobId)).thenReturn(true);
        return new MeetingAnalysisRunner(fastApiMeetingClient, fallbackMeetingAnalyzer, meetingAnalysisPersistence);
    }

    @Test
    void savesSuccessWithFastApiSourceWhenFastApiSucceeds() {
        MeetingAnalysisResult result = new MeetingAnalysisResult(
            "요약", List.of(), List.of(), List.of(), List.of(), new MeetingMeta("정기회의", "2026-07-15", List.of())
        );
        when(fastApiMeetingClient.analyze(request)).thenReturn(result);

        newRunner().runAnalysis(9L, request, jobId);

        verify(meetingAnalysisPersistence).saveAnalysisSuccessForJob(9L, result, "FASTAPI", jobId);
        verify(meetingAnalysisPersistence, never()).saveAnalysisFailureForJob(any(), any(), any());
    }

    @Test
    void fallsBackToSpringAnalyzerWhenFastApiThrows() {
        MeetingAnalysisResult fallbackResult = new MeetingAnalysisResult(
            "요약", List.of(), List.of(), List.of(), List.of(), new MeetingMeta("정기회의", "2026-07-15", List.of())
        );
        when(fastApiMeetingClient.analyze(request)).thenThrow(new RuntimeException("연결 실패"));
        when(fallbackMeetingAnalyzer.analyze(request)).thenReturn(fallbackResult);

        newRunner().runAnalysis(9L, request, jobId);

        verify(meetingAnalysisPersistence).saveAnalysisSuccessForJob(9L, fallbackResult, "SPRING_FALLBACK", jobId);
    }

    @Test
    void savesFailureWhenBothFastApiAndFallbackThrow() {
        when(fastApiMeetingClient.analyze(request)).thenThrow(new RuntimeException("연결 실패"));
        when(fallbackMeetingAnalyzer.analyze(request)).thenThrow(new RuntimeException("fallback 실패"));

        newRunner().runAnalysis(9L, request, jobId);

        verify(meetingAnalysisPersistence).saveAnalysisFailureForJob(
            9L,
            MeetingAnalysisPersistence.DEFAULT_ANALYSIS_ERROR_MESSAGE,
            jobId
        );
    }
}
