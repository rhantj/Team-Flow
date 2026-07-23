package com.workflowai.rag;

import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;

import com.workflowai.task.TaskRepository;
import java.time.Duration;
import java.util.concurrent.Executor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.retry.annotation.EnableRetry;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.web.client.RestClientException;

// RagIngestServiceRetryTest는 @EnableAsync 없이 동기적으로만 재시도 로직을 검증한다.
// 이 테스트는 실제 운영 환경과 동일하게 @Async("ragIngestExecutor")와 @Retryable을
// 동시에 활성화해서, 두 AOP 프록시(Async가 바깥, Retry가 안쪽)가 올바른 순서로
// 합성되는지 - 호출 스레드는 즉시 반환되고, 재시도/백오프/@Recover가 모두 비동기
// 실행기 스레드 위에서 실제로 수행되는지 - 를 검증한다.
@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = RagIngestServiceAsyncRetryIntegrationTest.AsyncRetryTestConfig.class)
@TestPropertySource(properties = {
    "rag.assignee-sync.retry.delay-ms=1",
    "rag.assignee-sync.retry.multiplier=1"
})
class RagIngestServiceAsyncRetryIntegrationTest {

    @Autowired
    private RagIngestService ragIngestService;

    @Autowired
    private FastApiRagClient fastApiRagClient;

    @Autowired
    private RagAssigneeSyncFailureRepository ragAssigneeSyncFailureRepository;

    @Autowired
    private TaskRepository taskRepository;

    @BeforeEach
    void setUp() {
        reset(fastApiRagClient, ragAssigneeSyncFailureRepository, taskRepository);
    }

    @AfterEach
    void tearDown() {
        reset(fastApiRagClient, ragAssigneeSyncFailureRepository, taskRepository);
    }

    @Test
    void asyncPlusRetryEventuallySucceedsAfterTransientFailures() {
        doThrow(new RestClientException("boom"))
            .doThrow(new RestClientException("boom"))
            .doNothing()
            .when(fastApiRagClient).syncAssignee(any());

        ragIngestService.syncAssigneeBestEffort(1L, "task", 10L, 99L);

        // @Async이므로 호출은 즉시 반환된다 - 재시도는 실행기 스레드에서 뒤늦게 일어나므로 폴링한다.
        await().atMost(Duration.ofSeconds(5))
            .untilAsserted(() -> verify(fastApiRagClient, times(3)).syncAssignee(any()));
        verify(ragAssigneeSyncFailureRepository, never()).save(any());
    }

    @Test
    void asyncPlusRetryKeepsPreRecordedIntentAfterExhaustingAllAttempts() {
        doThrow(new RestClientException("boom")).when(fastApiRagClient).syncAssignee(any());

        ragIngestService.syncAssigneeBestEffort(1L, "task", 10L, 99L);

        await().atMost(Duration.ofSeconds(5))
            .untilAsserted(() -> verify(fastApiRagClient, times(3)).syncAssignee(any()));

        verify(ragAssigneeSyncFailureRepository, never()).save(any());
    }

    @Configuration
    @EnableAsync
    @EnableRetry
    static class AsyncRetryTestConfig {
        @Bean
        Executor ragIngestExecutor() {
            ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
            executor.setCorePoolSize(2);
            executor.setMaxPoolSize(4);
            executor.setQueueCapacity(200);
            executor.setThreadNamePrefix("rag-ingest-test-");
            executor.initialize();
            return executor;
        }

        @Bean
        FastApiRagClient fastApiRagClient() {
            return mock(FastApiRagClient.class);
        }

        @Bean
        RagAssigneeSyncFailureRepository ragAssigneeSyncFailureRepository() {
            return mock(RagAssigneeSyncFailureRepository.class);
        }

        @Bean
        TaskRepository taskRepository() {
            return mock(TaskRepository.class);
        }

        @Bean
        RagIngestService ragIngestService(
            FastApiRagClient client,
            RagAssigneeSyncFailureRepository repo,
            TaskRepository taskRepository
        ) {
            return new RagIngestService(client, repo, taskRepository);
        }
    }
}
