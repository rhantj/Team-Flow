package com.workflowai.rag;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.retry.annotation.EnableRetry;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.context.TestPropertySource;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.client.RestClientException;

@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = RagIngestServiceRetryTest.RetryTestConfig.class)
@TestPropertySource(properties = {
    "rag.assignee-sync.retry.delay-ms=1",
    "rag.assignee-sync.retry.multiplier=1"
})
class RagIngestServiceRetryTest {

    @Autowired
    private RagIngestService ragIngestService;

    @Autowired
    private FastApiRagClient fastApiRagClient;

    @Autowired
    private RagAssigneeSyncFailureRepository ragAssigneeSyncFailureRepository;

    @BeforeEach
    void setUp() {
        reset(fastApiRagClient, ragAssigneeSyncFailureRepository);
    }

    @AfterEach
    void tearDown() {
        reset(fastApiRagClient, ragAssigneeSyncFailureRepository);
    }

    @Test
    void syncAssigneeRetriesAndSucceedsWithinAttemptLimit() {
        doThrow(new RestClientException("boom"))
            .doThrow(new RestClientException("boom"))
            .doNothing()
            .when(fastApiRagClient).syncAssignee(any());

        ragIngestService.syncAssigneeBestEffort(1L, "task", 10L, 99L);

        verify(fastApiRagClient, times(3)).syncAssignee(any());
        verifyNoInteractions(ragAssigneeSyncFailureRepository);
    }

    @Test
    void syncAssigneeRecordsFailureAfterExhaustingRetries() {
        doThrow(new RestClientException("boom")).when(fastApiRagClient).syncAssignee(any());

        ragIngestService.syncAssigneeBestEffort(1L, "task", 10L, 99L);

        verify(fastApiRagClient, times(3)).syncAssignee(any());
        ArgumentCaptor<RagAssigneeSyncFailure> captor = ArgumentCaptor.forClass(RagAssigneeSyncFailure.class);
        verify(ragAssigneeSyncFailureRepository).save(captor.capture());
        RagAssigneeSyncFailure saved = captor.getValue();
        assertThat(saved.getProjectId()).isEqualTo(1L);
        assertThat(saved.getSourceType()).isEqualTo("task");
        assertThat(saved.getSourceId()).isEqualTo(10L);
        assertThat(saved.getAssigneeId()).isEqualTo(99L);
        assertThat(saved.getErrorMessage()).contains("boom");
    }

    @Configuration
    @EnableRetry
    static class RetryTestConfig {
        @Bean
        FastApiRagClient fastApiRagClient() {
            return mock(FastApiRagClient.class);
        }

        @Bean
        RagAssigneeSyncFailureRepository ragAssigneeSyncFailureRepository() {
            return mock(RagAssigneeSyncFailureRepository.class);
        }

        @Bean
        RagIngestService ragIngestService(FastApiRagClient client, RagAssigneeSyncFailureRepository repo) {
            return new RagIngestService(client, repo);
        }
    }
}
