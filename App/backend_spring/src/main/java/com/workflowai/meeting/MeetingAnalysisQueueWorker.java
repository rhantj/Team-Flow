package com.workflowai.meeting;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.function.LongConsumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StreamOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

@Component
public class MeetingAnalysisQueueWorker implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(MeetingAnalysisQueueWorker.class);

    private static final String GROUP = "meeting-analysis-workers";
    private static final String CONSUMER_NAME = "meeting-analysis-worker";
    private static final String PAYLOAD_FIELD = "payload";
    private static final long INITIAL_BACKOFF_MILLIS = 250L;
    private static final long MAX_BACKOFF_MILLIS = 5_000L;
    private static final long SHUTDOWN_JOIN_MILLIS = 6_000L;

    private static final RedisScript<Long> ACK_AND_DELETE_SCRIPT = RedisScript.of(
        """
        if not redis.acl_check_cmd('XACK', KEYS[1], ARGV[1], ARGV[2]) then
            return redis.error_reply('XACK permission denied')
        end
        if not redis.acl_check_cmd('XDEL', KEYS[1], ARGV[2]) then
            return redis.error_reply('XDEL permission denied')
        end
        redis.call('XACK', KEYS[1], ARGV[1], ARGV[2])
        return redis.call('XDEL', KEYS[1], ARGV[2])
        """,
        Long.class
    );

    private static final Consumer CONSUMER = Consumer.from(GROUP, CONSUMER_NAME);
    private static final StreamReadOptions PENDING_READ_OPTIONS = StreamReadOptions.empty().count(1);
    private static final StreamReadOptions NEW_READ_OPTIONS = StreamReadOptions.empty()
        .block(Duration.ofSeconds(5))
        .count(1);
    private static final StreamOffset<String> PENDING_OFFSET = StreamOffset.create(
        MeetingAnalysisJobPublisher.STREAM_KEY,
        ReadOffset.from("0")
    );
    private static final StreamOffset<String> NEW_OFFSET = StreamOffset.create(
        MeetingAnalysisJobPublisher.STREAM_KEY,
        ReadOffset.lastConsumed()
    );

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final MeetingRepository meetingRepository;
    private final MeetingAnalysisRunner runner;
    private final LongConsumer delay;

    private volatile boolean running;
    private volatile boolean groupInitialized;
    private volatile Thread workerThread;
    private long nextBackoffMillis = INITIAL_BACKOFF_MILLIS;

    public MeetingAnalysisQueueWorker(
        StringRedisTemplate redisTemplate,
        ObjectMapper objectMapper,
        MeetingRepository meetingRepository,
        MeetingAnalysisRunner runner
    ) {
        this(redisTemplate, objectMapper, meetingRepository, runner, MeetingAnalysisQueueWorker::sleep);
    }

    MeetingAnalysisQueueWorker(
        StringRedisTemplate redisTemplate,
        ObjectMapper objectMapper,
        MeetingRepository meetingRepository,
        MeetingAnalysisRunner runner,
        LongConsumer delay
    ) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.meetingRepository = meetingRepository;
        this.runner = runner;
        this.delay = delay;
    }

    @Override
    public synchronized void run(ApplicationArguments arguments) {
        if (running) {
            return;
        }
        running = true;
        Thread thread = new Thread(this::workLoop, CONSUMER_NAME);
        thread.setDaemon(true);
        workerThread = thread;
        thread.start();
    }

    void pollOnce() {
        try {
            doPollOnce();
            nextBackoffMillis = INITIAL_BACKOFF_MILLIS;
        } catch (DataAccessException exception) {
            log.warn("Redis Stream poll failed. errorType={}", exception.getClass().getSimpleName());
            delay.accept(nextBackoffMillis);
            nextBackoffMillis = Math.min(nextBackoffMillis * 2, MAX_BACKOFF_MILLIS);
        }
    }

    public boolean isReady() {
        return groupInitialized && running && isWorkerAlive();
    }

    public boolean isWorkerAlive() {
        Thread thread = workerThread;
        return thread != null && thread.isAlive();
    }

    @PreDestroy
    synchronized void shutdown() {
        running = false;
        groupInitialized = false;
        Thread thread = workerThread;
        if (thread == null) {
            return;
        }
        thread.interrupt();
        try {
            thread.join(SHUTDOWN_JOIN_MILLIS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
    }

    private void workLoop() {
        while (running) {
            if (!groupInitialized) {
                initializeGroup();
                continue;
            }
            pollOnce();
        }
    }

    private void initializeGroup() {
        try {
            redisTemplate.execute((RedisCallback<String>) connection -> connection.streamCommands().xGroupCreate(
                Objects.requireNonNull(redisTemplate.getStringSerializer().serialize(MeetingAnalysisJobPublisher.STREAM_KEY)),
                GROUP,
                ReadOffset.from("0"),
                true
            ));
            groupInitialized = true;
            nextBackoffMillis = INITIAL_BACKOFF_MILLIS;
        } catch (DataAccessException exception) {
            if (isBusyGroup(exception)) {
                groupInitialized = true;
                nextBackoffMillis = INITIAL_BACKOFF_MILLIS;
                return;
            }
            log.warn("Redis Stream group initialization failed. errorType={}", exception.getClass().getSimpleName());
            delay.accept(nextBackoffMillis);
            nextBackoffMillis = Math.min(nextBackoffMillis * 2, MAX_BACKOFF_MILLIS);
        }
    }

    private void doPollOnce() {
        StreamOperations<String, String, String> operations = streamOperations();
        List<MapRecord<String, String, String>> records = operations.read(CONSUMER, PENDING_READ_OPTIONS, PENDING_OFFSET);
        if (records == null || records.isEmpty()) {
            records = operations.read(CONSUMER, NEW_READ_OPTIONS, NEW_OFFSET);
        }
        if (records == null || records.isEmpty()) {
            return;
        }
        process(records.getFirst());
    }

    private void process(MapRecord<String, String, String> record) {
        MeetingAnalysisJob job;
        try {
            job = deserialize(record);
        } catch (JsonProcessingException | IllegalArgumentException exception) {
            log.warn("Discarding malformed meeting analysis record. recordId={}", record.getId().getValue());
            acknowledgeAndDelete(record.getId());
            return;
        }

        Optional<Meeting> meeting;
        try {
            meeting = meetingRepository.findById(job.meetingId());
        } catch (DataAccessException exception) {
            log.warn(
                "Meeting lookup failed; record remains pending. recordId={}, jobId={}, meetingId={}, errorType={}",
                record.getId().getValue(),
                job.jobId(),
                job.meetingId(),
                exception.getClass().getSimpleName()
            );
            return;
        }
        if (meeting.isEmpty() || isTerminal(meeting.get().getAnalysisStatus())) {
            log.info(
                "Skipping terminal meeting analysis job. recordId={}, jobId={}, meetingId={}",
                record.getId().getValue(),
                job.jobId(),
                job.meetingId()
            );
            acknowledgeAndDelete(record.getId());
            return;
        }

        try {
            runner.runAnalysis(job.meetingId(), job.request());
        } catch (RuntimeException exception) {
            log.warn(
                "Meeting analysis runner failed; record remains pending. recordId={}, jobId={}, meetingId={}, errorType={}",
                record.getId().getValue(),
                job.jobId(),
                job.meetingId(),
                exception.getClass().getSimpleName()
            );
            return;
        }
        acknowledgeAndDelete(record.getId());
    }

    private MeetingAnalysisJob deserialize(MapRecord<String, String, String> record) throws JsonProcessingException {
        String payload = record.getValue().get(PAYLOAD_FIELD);
        MeetingAnalysisJob job = objectMapper.readValue(payload, MeetingAnalysisJob.class);
        if (job.jobId() == null || job.jobId().isBlank() || job.meetingId() == null || job.request() == null) {
            throw new IllegalArgumentException("Missing required job field");
        }
        return job;
    }

    private void acknowledgeAndDelete(RecordId recordId) {
        redisTemplate.execute(
            ACK_AND_DELETE_SCRIPT,
            List.of(MeetingAnalysisJobPublisher.STREAM_KEY),
            GROUP,
            recordId.getValue()
        );
    }

    @SuppressWarnings("unchecked")
    private StreamOperations<String, String, String> streamOperations() {
        return (StreamOperations<String, String, String>) (StreamOperations<?, ?, ?>) redisTemplate.opsForStream();
    }

    private boolean isTerminal(String status) {
        if (status == null) {
            return false;
        }
        String normalized = status.toLowerCase(Locale.ROOT);
        return normalized.equals("completed") || normalized.equals("failed");
    }

    private boolean isBusyGroup(Throwable exception) {
        Throwable current = exception;
        while (current != null) {
            if (current.getMessage() != null && current.getMessage().contains("BUSYGROUP")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
    }
}
