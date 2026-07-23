package com.workflowai.common;

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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class HealthControllerTest {

    private RedisConnectionFactory redisConnectionFactory;
    private RedisConnection redisConnection;
    private MeetingAnalysisQueueWorker worker;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        redisConnectionFactory = mock(RedisConnectionFactory.class);
        redisConnection = mock(RedisConnection.class);
        worker = mock(MeetingAnalysisQueueWorker.class);
        when(redisConnectionFactory.getConnection()).thenReturn(redisConnection);
        when(redisConnection.ping()).thenReturn("PONG");
        when(worker.isReady()).thenReturn(true);
        when(worker.isWorkerAlive()).thenReturn(true);
        mockMvc = MockMvcBuilders
            .standaloneSetup(new HealthController(redisConnectionFactory, worker))
            .build();
    }

    @Test
    void returnsUpWithExistingEnvelopeAndFieldsWhenDependenciesAreReady() throws Exception {
        mockMvc.perform(get("/api/v1/health"))
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

        mockMvc.perform(get("/api/v1/health"))
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
    void returnsServiceUnavailableWhenWorkerIsNotReady() throws Exception {
        when(worker.isReady()).thenReturn(false);

        mockMvc.perform(get("/api/v1/health"))
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

        mockMvc.perform(get("/api/v1/health"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.data.status").value("DOWN"))
            .andExpect(jsonPath("$.data.redisStatus").doesNotExist())
            .andExpect(jsonPath("$.data.workerReady").doesNotExist())
            .andExpect(jsonPath("$.data.workerAlive").doesNotExist());
    }
}
