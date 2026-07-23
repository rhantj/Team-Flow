package com.workflowai.meeting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.core.StreamOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

@ExtendWith(MockitoExtension.class)
class MeetingAnalysisJobPublisherTest {

    private static final String RAW_TEXT = "외부에 노출되면 안 되는 회의 원문";

    @Mock private StringRedisTemplate redisTemplate;
    @Mock private StreamOperations<String, Object, Object> streamOperations;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AiAnalyzeRequest request = new AiAnalyzeRequest(
        "project-1",
        "분기 계획 회의",
        "2026-07-23",
        "planning",
        "document",
        "meeting.txt",
        RAW_TEXT,
        List.of("김민준", "이서연")
    );

    @Test
    void enqueuesSerializedJobAndReturnsRedisRecordId() throws Exception {
        RecordId recordId = RecordId.of("1753257600000-0");
        when(redisTemplate.opsForStream()).thenReturn(streamOperations);
        when(streamOperations.size(MeetingAnalysisJobPublisher.STREAM_KEY)).thenReturn(999L);
        when(streamOperations.add(any())).thenReturn(recordId);
        MeetingAnalysisJobPublisher publisher = new MeetingAnalysisJobPublisher(redisTemplate, objectMapper);

        String result = publisher.enqueue(42L, request);

        ArgumentCaptor<MapRecord<String, Object, Object>> recordCaptor = ArgumentCaptor.captor();
        verify(streamOperations).add(recordCaptor.capture());
        MapRecord<String, Object, Object> record = recordCaptor.getValue();
        assertThat(record.getStream()).isEqualTo(MeetingAnalysisJobPublisher.STREAM_KEY);
        assertThat(record.getValue()).containsOnlyKeys("payload");

        MeetingAnalysisJob job = objectMapper.readValue(
            (String) record.getValue().get("payload"),
            MeetingAnalysisJob.class
        );
        assertThat(job.jobId()).isNotBlank();
        assertThat(UUID.fromString(job.jobId())).isNotNull();
        assertThat(job.meetingId()).isEqualTo(42L);
        assertThat(job.request()).isEqualTo(request);
        assertThat(result).isEqualTo(recordId.getValue());
    }

    @Test
    void throwsIllegalStateExceptionWhenSerializationFails() throws Exception {
        ObjectMapper failingObjectMapper = org.mockito.Mockito.mock(ObjectMapper.class);
        JsonProcessingException failure = new JsonProcessingException("serialization failed") {};
        when(failingObjectMapper.writeValueAsString(any(MeetingAnalysisJob.class))).thenThrow(failure);
        MeetingAnalysisJobPublisher publisher = new MeetingAnalysisJobPublisher(redisTemplate, failingObjectMapper);

        assertThatThrownBy(() -> publisher.enqueue(42L, request))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("Failed to enqueue meeting analysis job")
            .hasCause(failure)
            .hasMessageNotContaining(RAW_TEXT);
        verify(streamOperations, never()).add(any());
    }

    @Test
    void throwsIllegalStateExceptionWhenRedisAddFails() {
        RuntimeException failure = new RuntimeException("redis unavailable");
        when(redisTemplate.opsForStream()).thenReturn(streamOperations);
        when(streamOperations.size(MeetingAnalysisJobPublisher.STREAM_KEY)).thenReturn(0L);
        when(streamOperations.add(any())).thenThrow(failure);
        MeetingAnalysisJobPublisher publisher = new MeetingAnalysisJobPublisher(redisTemplate, objectMapper);

        assertThatThrownBy(() -> publisher.enqueue(42L, request))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("Failed to enqueue meeting analysis job")
            .hasCause(failure)
            .hasMessageNotContaining(RAW_TEXT);
    }

    @Test
    void rejectsOversizedUtf8PayloadWithoutAddingToRedis() {
        AiAnalyzeRequest oversizedRequest = new AiAnalyzeRequest(
            "project-1",
            "대용량 회의",
            "2026-07-23",
            "planning",
            "document",
            "meeting.txt",
            "가".repeat(MeetingAnalysisJobPublisher.MAX_PAYLOAD_BYTES),
            List.of("김민준")
        );
        MeetingAnalysisJobPublisher publisher = new MeetingAnalysisJobPublisher(redisTemplate, objectMapper);

        assertThatThrownBy(() -> publisher.enqueue(42L, oversizedRequest))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("Failed to enqueue meeting analysis job")
            .hasMessageNotContaining("가");
        verify(streamOperations, never()).add(any());
    }

    @Test
    void rejectsJobWhenOutstandingQueueLimitIsReached() {
        when(redisTemplate.opsForStream()).thenReturn(streamOperations);
        when(streamOperations.size(MeetingAnalysisJobPublisher.STREAM_KEY))
            .thenReturn((long) MeetingAnalysisJobPublisher.MAX_OUTSTANDING_JOBS);
        MeetingAnalysisJobPublisher publisher = new MeetingAnalysisJobPublisher(redisTemplate, objectMapper);

        assertThatThrownBy(() -> publisher.enqueue(42L, request))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("Failed to enqueue meeting analysis job")
            .hasMessageNotContaining(RAW_TEXT);
        verify(streamOperations, never()).add(any());
    }

    @Test
    void rejectsJobSafelyWhenOutstandingQueueSizeCannotBeRead() {
        RuntimeException failure = new RuntimeException("redis://admin:secret@internal:6379");
        when(redisTemplate.opsForStream()).thenReturn(streamOperations);
        when(streamOperations.size(MeetingAnalysisJobPublisher.STREAM_KEY)).thenThrow(failure);
        MeetingAnalysisJobPublisher publisher = new MeetingAnalysisJobPublisher(redisTemplate, objectMapper);

        assertThatThrownBy(() -> publisher.enqueue(42L, request))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("Failed to enqueue meeting analysis job")
            .hasNoCause()
            .hasMessageNotContaining("admin:secret")
            .hasMessageNotContaining(RAW_TEXT);
        verify(streamOperations, never()).add(any());
    }
}
