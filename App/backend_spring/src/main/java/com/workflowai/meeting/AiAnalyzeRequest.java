package com.workflowai.meeting;

import java.util.List;

public record AiAnalyzeRequest(
    String project_id,
    String title,
    String meeting_date,
    String meeting_kind,
    String source_type,
    String file_name,
    String text,
    List<String> participants
) {}
