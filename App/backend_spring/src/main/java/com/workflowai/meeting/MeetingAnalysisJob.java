package com.workflowai.meeting;

public record MeetingAnalysisJob(String jobId, Long meetingId, AiAnalyzeRequest request) {}
