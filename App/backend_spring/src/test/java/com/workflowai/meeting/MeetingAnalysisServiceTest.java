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
    void retryRejectsMeetingThatIsNotFailed() {
        MeetingAnalysisService service = newService();
        Meeting meeting = new Meeting(1L, "정기회의", "document", "/tmp/x.txt", "processing", LocalDate.now(), "정기회의", "x.txt", null, 5L);
        when(meetingRepository.findById(3L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> service.retry("3")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void findUsesConsistentProjectIdAndFileTypeForProcessingAndCompletedResponses() {
        MeetingAnalysisService service = newService();
        Meeting meeting = new Meeting(1L, "정기회의", "audio", "/tmp/x.mp3", "processing", LocalDate.now(), "정기회의", "x.mp3", null, 5L);
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(meetingRepository.findById(5L)).thenReturn(Optional.of(meeting));

        MeetingAnalysisResponse processing = service.find("5");

        assertThat(processing.projectId()).isEqualTo("demo-project");
        assertThat(processing.sourceType()).isEqualTo("audio");
        assertThat(processing.status()).isEqualTo("PROCESSING");

        meeting.setAnalysisStatus("completed");
        when(meetingAnalysisRepository.findById(5L)).thenReturn(Optional.of(new MeetingAnalysis(
            5L, "요약", List.of("결정"), List.of("위험"), List.of("키워드"), "FASTAPI"
        )));
        when(meetingActionItemRepository.findByMeetingId(5L)).thenReturn(List.of());

        MeetingAnalysisResponse completed = service.find("5");

        assertThat(completed.projectId()).isEqualTo("demo-project");
        assertThat(completed.sourceType()).isEqualTo("audio");
        assertThat(completed.status()).isEqualTo("COMPLETED");
    }

    @Test
    void retryTransitionsFailedMeetingBackToProcessing() throws Exception {
        MeetingAnalysisService service = newService();
        Path textFile = Files.createTempFile("meeting-notes", ".txt");
        Files.writeString(textFile, "재분석할 회의 내용");
        Meeting meeting = new Meeting(1L, "정기회의", "document", textFile.toString(), "failed", LocalDate.now(), "정기회의", "x.txt", null, 5L);
        when(meetingRepository.findById(4L)).thenReturn(Optional.of(meeting));
        when(meetingAttendeeRepository.findByMeetingId(4L)).thenReturn(List.of());

        MeetingAnalysisResponse response = service.retry("4");

        assertThat(response.status()).isEqualTo("PROCESSING");
        assertThat(meeting.getAnalysisStatus()).isEqualTo("processing");
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
        ArgumentCaptor<MeetingAnalysis> analysisCaptor = ArgumentCaptor.forClass(MeetingAnalysis.class);
        verify(meetingAnalysisRepository).save(analysisCaptor.capture());
        assertThat(analysisCaptor.getValue().getSummary()).isEqualTo(MeetingAnalysisPersistence.REUPLOAD_REQUIRED_ERROR_MESSAGE);
        assertThat(analysisCaptor.getValue().getAnalysisEngine()).isEqualTo(MeetingAnalysisPersistence.FAILURE_ANALYSIS_SOURCE);
        verify(meetingAnalysisRunner, never()).runAnalysis(any(), any());
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
        ArgumentCaptor<MeetingAnalysis> analysisCaptor = ArgumentCaptor.forClass(MeetingAnalysis.class);
        verify(meetingAnalysisRepository).save(analysisCaptor.capture());
        assertThat(analysisCaptor.getValue().getSummary()).isEqualTo(MeetingAnalysisPersistence.REUPLOAD_READ_ERROR_MESSAGE);
        assertThat(analysisCaptor.getValue().getAnalysisEngine()).isEqualTo(MeetingAnalysisPersistence.FAILURE_ANALYSIS_SOURCE);
        verify(meetingAnalysisRunner, never()).runAnalysis(any(), any());
        Files.deleteIfExists(emptyFile);
    }
}
