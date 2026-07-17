package com.workflowai.meeting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.workflowai.common.DemoDataService;
import com.workflowai.notification.NotificationRepository;
import com.workflowai.rag.RagIngestService;
import com.workflowai.task.TaskRepository;
import com.workflowai.user.UserRepository;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@ExtendWith(MockitoExtension.class)
class MeetingAnalysisServiceTest {

    @Mock private MeetingAnalysisRunner meetingAnalysisRunner;
    @Mock private DemoDataService demoDataService;
    @Mock private MeetingRepository meetingRepository;
    @Mock private MeetingAttendeeRepository meetingAttendeeRepository;
    @Mock private MeetingAnalysisRepository meetingAnalysisRepository;
    @Mock private MeetingActionItemRepository meetingActionItemRepository;
    @Mock private TaskRepository taskRepository;
    @Mock private NotificationRepository notificationRepository;
    @Mock private UserRepository userRepository;
    @Mock private RagIngestService ragIngestService;

    private MeetingAnalysisService newService() {
        return new MeetingAnalysisService(
            meetingAnalysisRunner, demoDataService, meetingRepository, meetingAttendeeRepository,
            meetingAnalysisRepository, meetingActionItemRepository, taskRepository, notificationRepository,
            userRepository, ragIngestService, "/tmp/workflow-uploads"
        );
    }

    @Test
    void analyzeSavesMeetingAsProcessingAndReturnsImmediately() {
        MeetingAnalysisService service = newService();
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(meetingRepository.save(any(Meeting.class))).thenAnswer(invocation -> invocation.getArgument(0));

        MockMultipartFile file = new MockMultipartFile("file", "notes.txt", "text/plain", "회의 내용".getBytes());
        MeetingAnalysisResponse response = service.analyze(
            "demo-project", file, "7차 정기회의", "2026-07-15", "정기회의", "document", List.of("김민준")
        );

        assertThat(response.status()).isEqualTo("PROCESSING");
        assertThat(response.analysis()).isNull();
        ArgumentCaptor<Meeting> meetingCaptor = ArgumentCaptor.forClass(Meeting.class);
        verify(meetingRepository, atLeastOnce()).save(meetingCaptor.capture());
        assertThat(meetingCaptor.getAllValues().get(0).getAnalysisStatus()).isEqualTo("processing");
        verify(meetingAnalysisRunner).runAnalysis(any(), any(AiAnalyzeRequest.class));
    }

    @Test
    void analyzeStartsRunnerAfterTransactionCommitWhenSynchronizationIsActive() {
        MeetingAnalysisService service = newService();
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(meetingRepository.save(any(Meeting.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TransactionSynchronizationManager.initSynchronization();
        try {
            MockMultipartFile file = new MockMultipartFile("file", "notes.txt", "text/plain", "회의 내용".getBytes());
            MeetingAnalysisResponse response = service.analyze(
                "demo-project", file, "7차 정기회의", "2026-07-15", "정기회의", "document", List.of("김민준")
            );

            assertThat(response.status()).isEqualTo("PROCESSING");
            verify(meetingAnalysisRunner, never()).runAnalysis(any(), any(AiAnalyzeRequest.class));

            TransactionSynchronizationManager.getSynchronizations()
                .forEach(TransactionSynchronization::afterCommit);

            verify(meetingAnalysisRunner).runAnalysis(any(), any(AiAnalyzeRequest.class));
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void findUsesFileTypeAsResponseSourceTypeForProcessingAndCompletedMeetings() {
        MeetingAnalysisService service = newService();
        Meeting processingMeeting = new Meeting(1L, "정기회의", "audio", null, "processing", LocalDate.now(), "정기회의", "recording.mp3", null, 5L);
        Meeting completedMeeting = new Meeting(1L, "정기회의", "video", null, "completed", LocalDate.now(), "정기회의", "meeting.mp4", null, 5L);
        when(meetingRepository.findById(8L)).thenReturn(Optional.of(processingMeeting));
        when(meetingRepository.findById(9L)).thenReturn(Optional.of(completedMeeting));
        when(meetingAnalysisRepository.findById(9L)).thenReturn(Optional.of(new MeetingAnalysis(
            9L, "요약", List.of(), List.of(), List.of(), "SPRING_FALLBACK"
        )));
        when(meetingActionItemRepository.findByMeetingId(9L)).thenReturn(List.of());

        MeetingAnalysisResponse processingResponse = service.find("8");
        MeetingAnalysisResponse completedResponse = service.find("9");

        assertThat(processingResponse.sourceType()).isEqualTo("audio");
        assertThat(completedResponse.sourceType()).isEqualTo("video");
    }

    @Test
    void retryRejectsMeetingThatIsNotFailed() {
        MeetingAnalysisService service = newService();
        Meeting meeting = new Meeting(1L, "정기회의", "document", "/tmp/x.txt", "processing", LocalDate.now(), "정기회의", "x.txt", null, 5L);
        when(meetingRepository.findById(3L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> service.retry("3")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void retryTransitionsFailedMeetingBackToProcessing() throws Exception {
        MeetingAnalysisService service = newService();
        Path textFile = Files.createTempFile("meeting-notes", ".txt");
        Files.writeString(textFile, "재분석할 회의 내용");
        Meeting meeting = new Meeting(1L, "정기회의", "document", textFile.toString(), "failed", LocalDate.now(), "정기회의", "x.txt", null, 5L);
        meeting.setAnalysisErrorMessage("이전 실패 사유");
        when(meetingRepository.findById(4L)).thenReturn(Optional.of(meeting));
        when(meetingAttendeeRepository.findByMeetingId(4L)).thenReturn(List.of());

        MeetingAnalysisResponse response = service.retry("4");

        assertThat(response.status()).isEqualTo("PROCESSING");
        assertThat(meeting.getAnalysisStatus()).isEqualTo("processing");
        assertThat(meeting.getAnalysisErrorMessage()).isNull();
        verify(meetingAnalysisRunner).runAnalysis(4L, new AiAnalyzeRequest(
            "1", "정기회의", meeting.getMeetingDate().toString(), "정기회의", "document", "x.txt", "재분석할 회의 내용", List.of()
        ));
        Files.deleteIfExists(textFile);
    }

    @Test
    void retryFailsWithClearMessageWhenStoredFileIsNotTextExtractable() throws Exception {
        MeetingAnalysisService service = newService();
        Path audioFile = Files.createTempFile("meeting-audio", ".mp3");
        Files.write(audioFile, new byte[] { 0, 1, 2, 3 });
        Meeting meeting = new Meeting(
            1L, "정기회의", "audio", audioFile.toString(), "failed", LocalDate.now(), "정기회의", "recording.mp3", null, 5L
        );
        when(meetingRepository.findById(6L)).thenReturn(Optional.of(meeting));

        MeetingAnalysisResponse response = service.retry("6");

        assertThat(response.status()).isEqualTo("FAILED");
        assertThat(response.errorMessage()).isEqualTo(MeetingAnalysisPersistence.REUPLOAD_REQUIRED_ERROR_MESSAGE);
        assertThat(meeting.getAnalysisStatus()).isEqualTo("failed");
        assertThat(meeting.getAnalysisErrorMessage()).isEqualTo(MeetingAnalysisPersistence.REUPLOAD_REQUIRED_ERROR_MESSAGE);
        verify(meetingAnalysisRunner, org.mockito.Mockito.never()).runAnalysis(any(), any());
        Files.deleteIfExists(audioFile);
    }

    @Test
    void retryFailsWithClearMessageWhenStoredFileIsEmpty() throws Exception {
        MeetingAnalysisService service = newService();
        Path emptyFile = Files.createTempFile("meeting-empty", ".txt");
        Meeting meeting = new Meeting(
            1L, "정기회의", "document", emptyFile.toString(), "failed", LocalDate.now(), "정기회의", "empty.txt", null, 5L
        );
        when(meetingRepository.findById(7L)).thenReturn(Optional.of(meeting));

        MeetingAnalysisResponse response = service.retry("7");

        assertThat(response.status()).isEqualTo("FAILED");
        assertThat(response.errorMessage()).isEqualTo(MeetingAnalysisPersistence.REUPLOAD_READ_ERROR_MESSAGE);
        assertThat(meeting.getAnalysisStatus()).isEqualTo("failed");
        assertThat(meeting.getAnalysisErrorMessage()).isEqualTo(MeetingAnalysisPersistence.REUPLOAD_READ_ERROR_MESSAGE);
        verify(meetingAnalysisRunner, org.mockito.Mockito.never()).runAnalysis(any(), any());
        Files.deleteIfExists(emptyFile);
    }
}
