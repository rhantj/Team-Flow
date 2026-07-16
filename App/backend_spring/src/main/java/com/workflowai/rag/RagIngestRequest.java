package com.workflowai.rag;

// 필드명은 FastAPI RagIngestRequest 스키마와 동일한 snake_case 사용 (RagQueryRequest와 동일 관례).
public record RagIngestRequest(Long project_id, String source_type, Long source_id, String content) {}
