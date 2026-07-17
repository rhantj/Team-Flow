package com.workflowai.meeting;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Component
public class MeetingAnalysisRunner {
    private final FastApiMeetingClient fastApiMeetingClient;
    private final FallbackMeetingAnalyzer fallbackMeetingAnalyzer;
    private final MeetingAnalysisPersistence meetingAnalysisPersistence;

    public MeetingAnalysisRunner(
        FastApiMeetingClient fastApiMeetingClient,
        FallbackMeetingAnalyzer fallbackMeetingAnalyzer,
        MeetingAnalysisPersistence meetingAnalysisPersistence
    ) {
        this.fastApiMeetingClient = fastApiMeetingClient;
        this.fallbackMeetingAnalyzer = fallbackMeetingAnalyzer;
        this.meetingAnalysisPersistence = meetingAnalysisPersistence;
    }

    @Async("meetingAnalysisExecutor")
    public void runAnalysis(Long meetingId, AiAnalyzeRequest request) {
        MeetingAnalysisResult result;
        String analysisSource;
        try {
            MeetingAnalysisResult fastApiResult;
            try {
                fastApiResult = fastApiMeetingClient.analyze(request);
            } catch (Exception e) {
                fastApiResult = null;
            }
            if (fastApiResult != null) {
                result = fastApiResult;
                analysisSource = "FASTAPI";
            } else {
                result = fallbackMeetingAnalyzer.analyze(request);
                analysisSource = "SPRING_FALLBACK";
            }
        } catch (Exception e) {
            meetingAnalysisPersistence.saveAnalysisFailure(meetingId, e.getMessage());
            return;
        }

        try {
            meetingAnalysisPersistence.saveAnalysisSuccess(meetingId, result, analysisSource);
        } catch (Exception e) {
            meetingAnalysisPersistence.saveAnalysisFailure(meetingId, e.getMessage());
        }
    }
}
