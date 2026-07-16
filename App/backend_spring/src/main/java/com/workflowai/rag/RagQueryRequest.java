package com.workflowai.rag;

// React -> Spring -> FastAPI 전 구간에서 동일 스키마를 그대로 사용(FastAPI RagQueryRequest와 필드명 일치).
public record RagQueryRequest(Long project_id, String question) {}
