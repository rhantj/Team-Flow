package com.workflowai.common;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.workflowai.meeting.MeetingAnalysisQueueWorker;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class HealthControllerTest {

    private RedisConnectionFactory redisConnectionFactory;
    private RedisConnection redisConnection;
    private MeetingAnalysisQueueWorker worker;
    private JdbcTemplate jdbcTemplate;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        redisConnectionFactory = mock(RedisConnectionFactory.class);
        redisConnection = mock(RedisConnection.class);
        worker = mock(MeetingAnalysisQueueWorker.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        when(redisConnectionFactory.getConnection()).thenReturn(redisConnection);
        when(redisConnection.ping()).thenReturn("PONG");
        when(worker.isReady()).thenReturn(true);
        when(worker.isWorkerAlive()).thenReturn(true);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class))).thenReturn(1);
        mockMvc = MockMvcBuilders
            .standaloneSetup(new HealthController(redisConnectionFactory, worker, jdbcTemplate))
            .build();
    }

    @Test
    void returnsUpWithExistingEnvelopeAndFieldsWhenDependenciesAreReady() throws Exception {
        mockMvc.perform(get("/api/v1/health/ready"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.service").value("workflow-ai-backend"))
            .andExpect(jsonPath("$.data.status").value("UP"))
            .andExpect(jsonPath("$.data.checkedAt").isString())
            .andExpect(jsonPath("$.data.redisStatus").doesNotExist())
            .andExpect(jsonPath("$.data.workerReady").doesNotExist())
            .andExpect(jsonPath("$.data.workerAlive").doesNotExist());
    }

    @Test
    void returnsServiceUnavailableWithoutRedisExceptionDetails() throws Exception {
        when(redisConnectionFactory.getConnection()).thenThrow(
            new RedisConnectionFailureException("redis://admin:secret@internal:6379")
        );

        mockMvc.perform(get("/api/v1/health/ready"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.data.status").value("DOWN"))
            .andExpect(jsonPath("$.data.redisStatus").doesNotExist())
            .andExpect(jsonPath("$.data.workerReady").doesNotExist())
            .andExpect(jsonPath("$.data.workerAlive").doesNotExist())
            .andExpect(content().string(org.hamcrest.Matchers.not(
                org.hamcrest.Matchers.containsString("admin:secret")
            )));
    }

    @Test
    void livenessRemainsUpWhenRedisAndWorkerAreUnavailable() throws Exception {
        when(redisConnectionFactory.getConnection()).thenThrow(
            new RedisConnectionFailureException("offline")
        );
        when(worker.isReady()).thenReturn(false);
        when(worker.isWorkerAlive()).thenReturn(false);

        mockMvc.perform(get("/api/v1/health/live"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("UP"));

        mockMvc.perform(get("/api/v1/health/ready"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.data.status").value("DOWN"));
    }

    @Test
    void legacyHealthPathKeepsLivenessSemanticsWhenDependenciesAreDown() throws Exception {
        // 기존 /api/v1/health를 readiness로 바꾸면 Redis 장애 시 이 경로를 보던
        // 개발 스크립트·런북·롤백 검증이 함께 503을 받는다. liveness 의미를 유지해야 한다.
        when(redisConnectionFactory.getConnection()).thenThrow(
            new RedisConnectionFailureException("offline")
        );
        when(worker.isReady()).thenReturn(false);
        when(worker.isWorkerAlive()).thenReturn(false);

        mockMvc.perform(get("/api/v1/health"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("UP"));
    }

    @Test
    void returnsServiceUnavailableWhenWorkerIsNotReady() throws Exception {
        when(worker.isReady()).thenReturn(false);

        mockMvc.perform(get("/api/v1/health/ready"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.data.status").value("DOWN"))
            .andExpect(jsonPath("$.data.redisStatus").doesNotExist())
            .andExpect(jsonPath("$.data.workerReady").doesNotExist())
            .andExpect(jsonPath("$.data.workerAlive").doesNotExist());
    }

    @Test
    void returnsServiceUnavailableWhenWorkerThreadIsDead() throws Exception {
        when(worker.isReady()).thenReturn(false);
        when(worker.isWorkerAlive()).thenReturn(false);

        mockMvc.perform(get("/api/v1/health/ready"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.data.status").value("DOWN"))
            .andExpect(jsonPath("$.data.redisStatus").doesNotExist())
            .andExpect(jsonPath("$.data.workerReady").doesNotExist())
            .andExpect(jsonPath("$.data.workerAlive").doesNotExist());
    }

    @Test
    void returnsServiceUnavailableWhenRequiredDatabaseSchemaIsMissing() throws Exception {
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class)))
            .thenThrow(new org.springframework.jdbc.BadSqlGrammarException("schema", "select", null));

        mockMvc.perform(get("/api/v1/health/ready"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.data.status").value("DOWN"));
    }
}
