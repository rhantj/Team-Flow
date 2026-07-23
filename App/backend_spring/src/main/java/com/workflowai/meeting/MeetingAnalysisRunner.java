package com.workflowai.meeting;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    public void runAnalysis(Long meetingId, AiAnalyzeRequest request, UUID jobId) {
        if (!meetingAnalysisPersistence.claimJob(meetingId, jobId)) {
            log.info("Skipping stale meeting analysis job. meetingId={}", meetingId);
            return;
        }
        MeetingAnalysisResult result;
        String analysisSource;
        try {
            MeetingAnalysisResult fastApiResult;
            try {
                fastApiResult = fastApiMeetingClient.analyze(request);
            } catch (Exception e) {
                log.warn("FastAPI meeting analysis failed. meetingId={}, fallback=SPRING_FALLBACK", meetingId, e);
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
            log.warn("Meeting analysis failed after FastAPI/fallback attempts. meetingId={}", meetingId, e);
            meetingAnalysisPersistence.saveAnalysisFailureForJob(
                meetingId,
                MeetingAnalysisPersistence.DEFAULT_ANALYSIS_ERROR_MESSAGE,
                jobId
            );
            return;
        }

        try {
            meetingAnalysisPersistence.saveAnalysisSuccessForJob(meetingId, result, analysisSource, jobId);
        } catch (Exception e) {
            log.warn("Meeting analysis persistence failed. meetingId={}", meetingId, e);
            meetingAnalysisPersistence.saveAnalysisFailureForJob(
                meetingId,
                MeetingAnalysisPersistence.DEFAULT_ANALYSIS_ERROR_MESSAGE,
                jobId
            );
        }
    }
}
