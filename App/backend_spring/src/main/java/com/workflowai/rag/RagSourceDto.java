package com.workflowai.rag;

// 필드명은 camelCase 관례 대신 FastAPI RagSource 스키마와 동일한 snake_case를 사용한다
// (Jackson이 필드명 그대로 JSON에 매핑 — AiAnalyzeRequest/MeetingAnalysisResult와 동일 관례).
public record RagSourceDto(String source_type, Long source_id, String content_snippet, double similarity) {}
