package com.workflowai.rag;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

// RAG 임베딩은 어시스턴트 답변 품질을 높이는 부가 기능이라, FastAPI 장애나 지연이
// 회의록/업무 저장 흐름(호출 스레드)을 막지 않도록 별도 스레드에서 처리하고 예외를 삼킨다.
@Service
public class RagIngestService {
    private static final Logger log = LoggerFactory.getLogger(RagIngestService.class);

    private final FastApiRagClient fastApiRagClient;

    public RagIngestService(FastApiRagClient fastApiRagClient) {
        this.fastApiRagClient = fastApiRagClient;
    }

    @Async("ragIngestExecutor")
    public void ingestBestEffort(Long projectId, String sourceType, Long sourceId, String content) {
        if (projectId == null || sourceId == null || content == null || content.isBlank()) return;
        try {
            fastApiRagClient.ingest(new RagIngestRequest(projectId, sourceType, sourceId, content));
        } catch (Exception e) {
            log.warn("RAG ingest 실패 (무시): sourceType={}, sourceId={}", sourceType, sourceId, e);
        }
    }
}
