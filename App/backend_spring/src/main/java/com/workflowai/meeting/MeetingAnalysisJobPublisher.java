package com.workflowai.meeting;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StreamOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Component
public class MeetingAnalysisJobPublisher {

    public static final String STREAM_KEY = "meeting-analysis";
    public static final int MAX_PAYLOAD_BYTES = 1024 * 1024;
    public static final int MAX_OUTSTANDING_JOBS = 1000;

    private static final String ENQUEUE_FAILURE_MESSAGE = "Failed to enqueue meeting analysis job";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public MeetingAnalysisJobPublisher(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    public String enqueue(Long meetingId, AiAnalyzeRequest request) {
        MeetingAnalysisJob job = new MeetingAnalysisJob(UUID.randomUUID().toString(), meetingId, request);
        String payload = serialize(job);
        if (payload.getBytes(StandardCharsets.UTF_8).length > MAX_PAYLOAD_BYTES) {
            throw new IllegalStateException(ENQUEUE_FAILURE_MESSAGE);
        }
        MapRecord<String, String, String> record = StreamRecords.newRecord()
            .ofMap(Map.of("payload", payload))
            .withStreamKey(STREAM_KEY);

        StreamOperations<String, Object, Object> streamOperations;
        Long outstandingJobs;
        try {
            streamOperations = redisTemplate.opsForStream();
            outstandingJobs = streamOperations.size(STREAM_KEY);
        } catch (RuntimeException exception) {
            throw new IllegalStateException(ENQUEUE_FAILURE_MESSAGE);
        }
        if (outstandingJobs == null || outstandingJobs >= MAX_OUTSTANDING_JOBS) {
            throw new IllegalStateException(ENQUEUE_FAILURE_MESSAGE);
        }

        RecordId recordId;
        try {
            recordId = streamOperations.add(record);
        } catch (RuntimeException exception) {
            throw new IllegalStateException(ENQUEUE_FAILURE_MESSAGE, exception);
        }
        if (recordId == null) {
            throw new IllegalStateException(ENQUEUE_FAILURE_MESSAGE);
        }
        return recordId.getValue();
    }

    private String serialize(MeetingAnalysisJob job) {
        try {
            return objectMapper.writeValueAsString(job);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException(ENQUEUE_FAILURE_MESSAGE, exception);
        }
    }
}
