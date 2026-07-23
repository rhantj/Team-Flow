package com.workflowai.meeting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.RedisSystemException;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisStreamCommands;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.data.redis.core.StreamOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class MeetingAnalysisQueueWorkerTest {

    private static final String PAYLOAD = "payload";
    private static final String GROUP = "meeting-analysis-workers";
    private static final String CONSUMER = "meeting-analysis-worker";

    @Mock private StringRedisTemplate redisTemplate;
    @Mock private StreamOperations<String, String, String> streamOperations;
    @Mock private MeetingRepository meetingRepository;
    @Mock private MeetingAnalysisRunner runner;
    @Mock private RedisConnection redisConnection;
    @Mock private RedisStreamCommands streamCommands;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final List<Long> delays = new ArrayList<>();
    private final AiAnalyzeRequest request = new AiAnalyzeRequest(
        "demo-project", "weekly", "2026-07-23", "regular", "document", "meeting.txt", "classified text",
        List.of("Kim")
    );

    @BeforeEach
    void setUp() {
        doReturn(streamOperations).when(redisTemplate).opsForStream();
    }

    @Test
    void readsSameConsumerPendingBeforeNewRecords() throws Exception {
        MapRecord<String, String, String> pending = record("1-0", validPayload(11L));
        when(streamOperations.read(any(Consumer.class), any(StreamReadOptions.class), anyStreamOffset()))
            .thenReturn(List.of(pending));
        when(meetingRepository.findById(11L)).thenReturn(Optional.of(processingMeeting()));

        newWorker().pollOnce();

        InOrder order = inOrder(streamOperations, redisTemplate);
        order.verify(streamOperations).read(
            Consumer.from(GROUP, CONSUMER),
            StreamReadOptions.empty().count(1),
            StreamOffset.create(MeetingAnalysisJobPublisher.STREAM_KEY, ReadOffset.from("0"))
        );
        order.verify(redisTemplate).execute(
            any(RedisScript.class),
            eq(List.of(MeetingAnalysisJobPublisher.STREAM_KEY)),
            eq(GROUP),
            eq("1-0")
        );
        verify(streamOperations, never()).read(
            Consumer.from(GROUP, CONSUMER),
            StreamReadOptions.empty().block(Duration.ofSeconds(5)).count(1),
            StreamOffset.create(MeetingAnalysisJobPublisher.STREAM_KEY, ReadOffset.lastConsumed())
        );
    }

    @Test
    void runsProcessingMeetingThenAcknowledgesAndDeletesInOrder() throws Exception {
        MapRecord<String, String, String> record = record("2-0", validPayload(12L));
        when(streamOperations.read(any(Consumer.class), any(StreamReadOptions.class), anyStreamOffset()))
            .thenReturn(List.of(), List.of(record));
        when(meetingRepository.findById(12L)).thenReturn(Optional.of(processingMeeting()));

        newWorker().pollOnce();

        InOrder order = inOrder(runner, redisTemplate);
        order.verify(runner).runAnalysis(12L, request);
        order.verify(redisTemplate).execute(
            any(RedisScript.class),
            eq(List.of(MeetingAnalysisJobPublisher.STREAM_KEY)),
            eq(GROUP),
            eq(record.getId().getValue())
        );
    }

    @Test
    void terminalOrMissingMeetingsSkipRunnerAndRemoveRecords() throws Exception {
        for (String status : List.of("completed", "failed")) {
            MapRecord<String, String, String> record = record(status.equals("completed") ? "3-0" : "4-0", validPayload(13L));
            when(streamOperations.read(any(Consumer.class), any(StreamReadOptions.class), anyStreamOffset()))
                .thenReturn(List.of(record));
            when(meetingRepository.findById(13L)).thenReturn(Optional.of(meeting(status)));

            newWorker().pollOnce();

            verify(redisTemplate).execute(
                any(RedisScript.class),
                eq(List.of(MeetingAnalysisJobPublisher.STREAM_KEY)),
                eq(GROUP),
                eq(record.getId().getValue())
            );
        }

        MapRecord<String, String, String> missing = record("5-0", validPayload(14L));
        when(streamOperations.read(any(Consumer.class), any(StreamReadOptions.class), anyStreamOffset()))
            .thenReturn(List.of(missing));
        when(meetingRepository.findById(14L)).thenReturn(Optional.empty());

        newWorker().pollOnce();

        verify(runner, never()).runAnalysis(any(), any());
        verify(redisTemplate).execute(
            any(RedisScript.class),
            eq(List.of(MeetingAnalysisJobPublisher.STREAM_KEY)),
            eq(GROUP),
            eq(missing.getId().getValue())
        );
    }

    @Test
    void runnerExceptionLeavesRecordPending() throws Exception {
        MapRecord<String, String, String> record = record("6-0", validPayload(15L));
        when(streamOperations.read(any(Consumer.class), any(StreamReadOptions.class), anyStreamOffset()))
            .thenReturn(List.of(record));
        when(meetingRepository.findById(15L)).thenReturn(Optional.of(processingMeeting()));
        org.mockito.Mockito.doThrow(new IllegalStateException("runner failed"))
            .when(runner).runAnalysis(15L, request);

        newWorker().pollOnce();

        verify(streamOperations, never()).acknowledge(anyString(), anyString(), any(RecordId[].class));
        verify(streamOperations, never()).delete(anyString(), any(RecordId[].class));
    }

    @Test
    void malformedPayloadIsNeverLoggedAndPoisonRecordIsRemoved() {
        String secretPayload = "not-json-secret-meeting-transcript";
        MapRecord<String, String, String> poison = record("7-0", secretPayload);
        when(streamOperations.read(any(Consumer.class), any(StreamReadOptions.class), anyStreamOffset()))
            .thenReturn(List.of(poison));
        Logger logger = (Logger) LoggerFactory.getLogger(MeetingAnalysisQueueWorker.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);

        try {
            newWorker().pollOnce();
        } finally {
            logger.detachAppender(appender);
        }

        assertThat(appender.list)
            .filteredOn(event -> event.getLevel().isGreaterOrEqual(Level.WARN))
            .extracting(ILoggingEvent::getFormattedMessage)
            .noneMatch(message -> message.contains(secretPayload));
        verify(redisTemplate).execute(
            any(RedisScript.class),
            eq(List.of(MeetingAnalysisJobPublisher.STREAM_KEY)),
            eq(GROUP),
            eq(poison.getId().getValue())
        );
    }

    @Test
    void redisErrorsUseBoundedExponentialBackoffAndSuccessResetsIt() {
        when(streamOperations.read(any(Consumer.class), any(StreamReadOptions.class), anyStreamOffset()))
            .thenThrow(new RedisConnectionFailureException("offline"))
            .thenThrow(new RedisConnectionFailureException("offline"))
            .thenReturn(List.of(), List.of())
            .thenThrow(new RedisConnectionFailureException("offline"))
            .thenThrow(new RedisConnectionFailureException("offline"))
            .thenThrow(new RedisConnectionFailureException("offline"))
            .thenThrow(new RedisConnectionFailureException("offline"))
            .thenThrow(new RedisConnectionFailureException("offline"))
            .thenThrow(new RedisConnectionFailureException("offline"));
        MeetingAnalysisQueueWorker worker = newWorker();

        for (int index = 0; index < 9; index++) {
            worker.pollOnce();
        }

        assertThat(delays).containsExactly(250L, 500L, 250L, 500L, 1_000L, 2_000L, 4_000L, 5_000L);
    }

    @Test
    void initializesGroupWithMkstreamSetsReadinessAndShutdownJoinsWorker() throws Exception {
        when(redisTemplate.getStringSerializer()).thenReturn(RedisSerializer.string());
        when(redisTemplate.execute(any(RedisCallback.class))).thenAnswer(invocation -> {
            RedisCallback<?> callback = invocation.getArgument(0);
            return callback.doInRedis(redisConnection);
        });
        when(redisConnection.streamCommands()).thenReturn(streamCommands);
        when(streamOperations.read(any(Consumer.class), any(StreamReadOptions.class), anyStreamOffset()))
            .thenAnswer(invocation -> {
                TimeUnit.MILLISECONDS.sleep(10);
                return List.of();
            });
        MeetingAnalysisQueueWorker worker = newWorker();

        worker.run(new DefaultApplicationArguments());
        await().atMost(Duration.ofSeconds(1)).until(worker::isReady);

        assertThat(worker.isWorkerAlive()).isTrue();
        Thread workerThread = (Thread) ReflectionTestUtils.getField(worker, "workerThread");
        assertThat(workerThread).isNotNull();
        assertThat(workerThread.isDaemon()).isTrue();
        verify(streamCommands).xGroupCreate(
            RedisSerializer.string().serialize(MeetingAnalysisJobPublisher.STREAM_KEY),
            GROUP,
            ReadOffset.from("0"),
            true
        );
        worker.shutdown();
        assertThat(worker.isReady()).isFalse();
        assertThat(worker.isWorkerAlive()).isFalse();
    }

    @Test
    void ackAndDeleteAreOneAtomicScriptWithPermissionPreflightAndAckFirst() throws Exception {
        MapRecord<String, String, String> record = record("8-0", validPayload(18L));
        when(streamOperations.read(any(Consumer.class), any(StreamReadOptions.class), anyStreamOffset()))
            .thenReturn(List.of(record));
        when(meetingRepository.findById(18L)).thenReturn(Optional.of(processingMeeting()));

        newWorker().pollOnce();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<RedisScript<Long>> scriptCaptor = ArgumentCaptor.forClass(RedisScript.class);
        verify(redisTemplate).execute(
            scriptCaptor.capture(),
            eq(List.of(MeetingAnalysisJobPublisher.STREAM_KEY)),
            eq(GROUP),
            eq(record.getId().getValue())
        );
        String script = scriptCaptor.getValue().getScriptAsString();
        assertThat(script.indexOf("acl_check_cmd('XACK'")).isGreaterThanOrEqualTo(0);
        assertThat(script.indexOf("acl_check_cmd('XDEL'")).isGreaterThan(script.indexOf("acl_check_cmd('XACK'"));
        assertThat(script.indexOf("redis.call('XACK'")).isGreaterThan(script.indexOf("acl_check_cmd('XDEL'"));
        assertThat(script.indexOf("redis.call('XDEL'")).isGreaterThan(script.indexOf("redis.call('XACK'"));
        verify(streamOperations, never()).acknowledge(anyString(), anyString(), any(RecordId[].class));
        verify(streamOperations, never()).delete(anyString(), any(RecordId[].class));
    }

    @Test
    void atomicRemovalFailureLeavesNoStandalonePartialCleanupAndBacksOff() throws Exception {
        MapRecord<String, String, String> record = record("9-0", validPayload(19L));
        when(streamOperations.read(any(Consumer.class), any(StreamReadOptions.class), anyStreamOffset()))
            .thenReturn(List.of(record));
        when(meetingRepository.findById(19L)).thenReturn(Optional.of(processingMeeting()));
        when(redisTemplate.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenThrow(new RedisConnectionFailureException("script unavailable"));

        newWorker().pollOnce();

        assertThat(delays).containsExactly(250L);
        verify(streamOperations, never()).acknowledge(anyString(), anyString(), any(RecordId[].class));
        verify(streamOperations, never()).delete(anyString(), any(RecordId[].class));
    }

    @Test
    void repositoryFailureLeavesPendingWithoutRedisBackoffClassification() throws Exception {
        MapRecord<String, String, String> record = record("10-0", validPayload(20L));
        when(streamOperations.read(any(Consumer.class), any(StreamReadOptions.class), anyStreamOffset()))
            .thenReturn(List.of(record));
        when(meetingRepository.findById(20L)).thenThrow(new DataAccessResourceFailureException("database unavailable"));

        newWorker().pollOnce();

        assertThat(delays).isEmpty();
        verify(streamOperations, never()).acknowledge(anyString(), anyString(), any(RecordId[].class));
        verify(streamOperations, never()).delete(anyString(), any(RecordId[].class));
    }

    @Test
    void existingConsumerGroupErrorIsToleratedAsReady() {
        when(redisTemplate.execute(any(RedisCallback.class))).thenThrow(
            new RedisSystemException("group create failed", new RuntimeException("BUSYGROUP Consumer Group exists"))
        );
        when(streamOperations.read(any(Consumer.class), any(StreamReadOptions.class), anyStreamOffset()))
            .thenAnswer(invocation -> {
                TimeUnit.MILLISECONDS.sleep(10);
                return List.of();
            });
        MeetingAnalysisQueueWorker worker = newWorker();

        worker.run(new DefaultApplicationArguments());
        await().atMost(Duration.ofSeconds(1)).until(worker::isReady);

        worker.shutdown();
        assertThat(delays).isEmpty();
        assertThat(worker.isWorkerAlive()).isFalse();
    }

    private MeetingAnalysisQueueWorker newWorker() {
        return new MeetingAnalysisQueueWorker(redisTemplate, objectMapper, meetingRepository, runner, delays::add);
    }

    private String validPayload(Long meetingId) throws Exception {
        return objectMapper.writeValueAsString(new MeetingAnalysisJob("job-" + meetingId, meetingId, request));
    }

    private MapRecord<String, String, String> record(String id, String payload) {
        return MapRecord.create(MeetingAnalysisJobPublisher.STREAM_KEY, Map.of(PAYLOAD, payload)).withId(RecordId.of(id));
    }

    private Meeting processingMeeting() {
        return meeting("processing");
    }

    private Meeting meeting(String status) {
        return new Meeting(1L, "weekly", "txt", "/tmp/meeting.txt", status, null, null, "meeting.txt", 1L, 10L);
    }

    @SuppressWarnings("unchecked")
    private StreamOffset<String>[] anyStreamOffset() {
        return any(StreamOffset[].class);
    }
}
