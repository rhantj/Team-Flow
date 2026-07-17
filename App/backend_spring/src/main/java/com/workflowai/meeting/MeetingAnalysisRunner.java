package com.workflowai.meeting;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Component
public class MeetingAnalysisRunner {
    private static final Logger log = LoggerFactory.getLogger(MeetingAnalysisRunner.class);

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
            log.warn("Meeting analysis failed. meetingId={}", meetingId, e);
            meetingAnalysisPersistence.saveAnalysisFailure(meetingId, MeetingAnalysisPersistence.DEFAULT_ANALYSIS_ERROR_MESSAGE);
            return;
        }

        try {
            meetingAnalysisPersistence.saveAnalysisSuccess(meetingId, result, analysisSource);
        } catch (Exception e) {
            log.warn("Meeting analysis persistence failed. meetingId={}", meetingId, e);
            meetingAnalysisPersistence.saveAnalysisFailure(meetingId, MeetingAnalysisPersistence.DEFAULT_ANALYSIS_ERROR_MESSAGE);
        }
    }
}
