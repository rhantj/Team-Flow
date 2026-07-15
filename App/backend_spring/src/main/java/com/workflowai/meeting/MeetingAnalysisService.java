package com.workflowai.meeting;

import com.workflowai.common.DemoDataService;
import com.workflowai.notification.Notification;
import com.workflowai.notification.NotificationRepository;
import com.workflowai.task.Task;
import com.workflowai.task.TaskRepository;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MeetingAnalysisService {
    private final FastApiMeetingClient fastApiMeetingClient;
    private final FallbackMeetingAnalyzer fallbackMeetingAnalyzer;
    private final DemoDataService demoDataService;
    private final MeetingRepository meetingRepository;
    private final MeetingAttendeeRepository meetingAttendeeRepository;
    private final MeetingAnalysisRepository meetingAnalysisRepository;
    private final MeetingActionItemRepository meetingActionItemRepository;
    private final TaskRepository taskRepository;
    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final String uploadsDir;

    public MeetingAnalysisService(
        FastApiMeetingClient fastApiMeetingClient,
        FallbackMeetingAnalyzer fallbackMeetingAnalyzer,
        DemoDataService demoDataService,
        MeetingRepository meetingRepository,
        MeetingAttendeeRepository meetingAttendeeRepository,
        MeetingAnalysisRepository meetingAnalysisRepository,
        MeetingActionItemRepository meetingActionItemRepository,
        TaskRepository taskRepository,
        NotificationRepository notificationRepository,
        UserRepository userRepository,
        @Value("${workflow.uploads.dir}") String uploadsDir
    ) {
        this.fastApiMeetingClient = fastApiMeetingClient;
        this.fallbackMeetingAnalyzer = fallbackMeetingAnalyzer;
        this.demoDataService = demoDataService;
        this.meetingRepository = meetingRepository;
        this.meetingAttendeeRepository = meetingAttendeeRepository;
        this.meetingAnalysisRepository = meetingAnalysisRepository;
        this.meetingActionItemRepository = meetingActionItemRepository;
        this.taskRepository = taskRepository;
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.uploadsDir = uploadsDir;
    }

    public MeetingAnalysisResponse analyze(
        String projectId,
        MultipartFile file,
        String title,
        String meetingDate,
        String meetingKind,
        String sourceType,
        List<String> participants
    ) {
        Long projectDbId = demoDataService.resolveProjectId(projectId);
        String fileName = file == null ? null : file.getOriginalFilename();
        String text = extractText(file);
        String resolvedTitle = defaultString(title, "회의록 AI 분석 회의");
        String resolvedDate = defaultString(meetingDate, LocalDate.now().toString());
        String resolvedSourceType = defaultString(sourceType, "document");

        Meeting meeting = meetingRepository.save(new Meeting(
            projectDbId,
            resolvedTitle,
            resolvedSourceType,
            null,
            "processing",
            LocalDate.parse(resolvedDate),
            meetingKind,
            fileName,
            null,
            file == null ? null : file.getSize()
        ));

        AiAnalyzeRequest request = new AiAnalyzeRequest(
            projectId,
            resolvedTitle,
            resolvedDate,
            defaultString(meetingKind, "정기회의"),
            resolvedSourceType,
            fileName,
            text,
            participants == null ? List.of() : participants
        );

        MeetingAnalysisResult result;
        String analysisSource;
        try {
            result = fastApiMeetingClient.analyze(request);
            if (result == null) {
                result = fallbackMeetingAnalyzer.analyze(request);
                analysisSource = "SPRING_FALLBACK";
            } else {
                analysisSource = "FASTAPI";
            }
        } catch (Exception ignored) {
            result = fallbackMeetingAnalyzer.analyze(request);
            analysisSource = "SPRING_FALLBACK";
        }

        meeting.setFilePath(storeUploadedFile(meeting.getId(), file));
        meeting.setAnalysisStatus("completed");
        meetingRepository.save(meeting);

        meetingAnalysisRepository.save(new MeetingAnalysis(
            meeting.getId(), result.summary(), result.decisions(), result.risks(), result.keywords(), analysisSource
        ));

        for (MeetingTodo todo : result.todos()) {
            meetingActionItemRepository.save(new MeetingActionItem(
                meeting.getId(),
                todo.title(),
                todo.description(),
                todo.category(),
                resolveAssigneeByName(todo.assignee_candidate()),
                resolveAssignee(todo.assignee_id()),
                parseDateOrNull(todo.due_date()),
                todo.priority(),
                null
            ));
        }

        saveAttendees(meeting.getId(), safeParticipants(participants));

        String meetingId = String.valueOf(meeting.getId());
        return new MeetingAnalysisResponse(meetingId, projectId, "COMPLETED", resolvedSourceType, fileName, analysisSource, result);
    }

    public MeetingAnalysisResponse find(String meetingId) {
        Long id = parseLongOrNull(meetingId);
        if (id == null) return null;
        Meeting meeting = meetingRepository.findById(id).orElse(null);
        if (meeting == null) return null;
        MeetingAnalysis analysis = meetingAnalysisRepository.findById(id).orElse(null);
        if (analysis == null) return null;

        List<MeetingTodo> todos = meetingActionItemRepository.findByMeetingId(id).stream()
            .map(this::toMeetingTodo)
            .toList();
        MeetingAnalysisResult result = new MeetingAnalysisResult(
            analysis.getSummary(),
            analysis.getDecisions(),
            todos,
            analysis.getRisks(),
            analysis.getKeywords(),
            new MeetingMeta(
                meeting.getTitle(),
                meeting.getMeetingDate() == null ? null : meeting.getMeetingDate().toString(),
                List.of()
            )
        );
        return new MeetingAnalysisResponse(
            meetingId,
            String.valueOf(meeting.getProjectId()),
            "COMPLETED",
            meeting.getMeetingType(),
            meeting.getOriginalFileName(),
            analysis.getAnalysisEngine(),
            result
        );
    }

    public List<MeetingSummary> findByProject(String projectId) {
        Long projectDbId = demoDataService.resolveProjectId(projectId);
        return meetingRepository.findByProjectIdOrderByCreatedAtDesc(projectDbId).stream()
            .map(m -> new MeetingSummary(
                String.valueOf(m.getId()),
                m.getTitle(),
                m.getMeetingDate() == null ? null : m.getMeetingDate().toString(),
                m.getMeetingType(),
                m.getAnalysisStatus()
            ))
            .toList();
    }

    public TaskRegisterResponse registerTasks(String meetingId, TaskRegisterRequest request) {
        Long meetingDbId = parseLongOrNull(meetingId);
        List<MeetingTodo> todos = request == null || request.todos() == null ? List.of() : request.todos();
        Long currentLeaderId = demoDataService.resolveUserId("1");

        int registeredCount = 0;
        for (MeetingTodo todo : todos) {
            if (meetingDbId != null && registerSingleTask(meetingDbId, todo, currentLeaderId)) {
                registeredCount++;
            }
        }
        return new TaskRegisterResponse(meetingId, registeredCount, "REGISTERED");
    }

    private boolean registerSingleTask(Long meetingId, MeetingTodo todo, Long createdBy) {
        Long assigneeId = resolveAssignee(todo.assignee_id());
        LocalDate dueDate = parseDateOrNull(todo.due_date());

        Optional<MeetingActionItem> existingItem =
            meetingActionItemRepository.findFirstByMeetingIdAndTitle(meetingId, todo.title());
        if (existingItem.isPresent() && existingItem.get().getCreatedTaskId() != null) {
            return false;
        }

        Optional<Task> existingTask = taskRepository.findFirstBySourceMeetingIdAndTitleAndAssigneeIdAndDueDate(
            meetingId, todo.title(), assigneeId, dueDate
        );
        if (existingTask.isPresent()) {
            existingItem.ifPresent(item -> {
                item.setCreatedTaskId(existingTask.get().getId());
                meetingActionItemRepository.save(item);
            });
            return false;
        }

        Meeting meeting = meetingRepository.findById(meetingId).orElse(null);
        Task task = taskRepository.save(new Task(
            meeting == null ? null : meeting.getProjectId(),
            todo.title(),
            defaultString(todo.category(), "ETC"),
            "todo",
            assigneeId,
            dueDate,
            defaultString(todo.priority(), "MEDIUM"),
            todo.description(),
            "MEETING_AI",
            meetingId,
            createdBy
        ));

        MeetingActionItem item = existingItem.orElseGet(() -> new MeetingActionItem(
            meetingId, todo.title(), todo.description(), todo.category(),
            resolveAssigneeByName(todo.assignee_candidate()), assigneeId, dueDate, todo.priority(), null
        ));
        item.setFinalAssigneeId(assigneeId);
        item.setDueDate(dueDate);
        item.setApproved(true);
        item.setCreatedTaskId(task.getId());
        meetingActionItemRepository.save(item);

        if (assigneeId != null) {
            notificationRepository.save(new Notification(
                assigneeId,
                "TASK_ASSIGNED",
                "새 업무가 배정되었습니다",
                "'" + todo.title() + "' 업무가 배정되었습니다.",
                "task",
                task.getId()
            ));
        }
        return true;
    }

    private Long resolveAssigneeByName(String name) {
        if (name == null || name.isBlank()) return null;
        return userRepository.findFirstByName(name).map(User::getId).orElse(null);
    }

    private MeetingTodo toMeetingTodo(MeetingActionItem item) {
        return new MeetingTodo(
            item.getTitle(),
            item.getDescription(),
            resolveNameById(item.getRecommendedAssigneeId()),
            item.getFinalAssigneeId() == null ? null : String.valueOf(item.getFinalAssigneeId()),
            item.getDueDate() == null ? null : item.getDueDate().toString(),
            item.getPriority(),
            item.getCategory(),
            item.getFinalAssigneeId() == null
        );
    }

    private String resolveNameById(Long userId) {
        if (userId == null) return null;
        return userRepository.findById(userId).map(User::getName).orElse(null);
    }

    private String storeUploadedFile(Long meetingId, MultipartFile file) {
        if (file == null || file.isEmpty()) return null;
        try {
            Path dir = Path.of(uploadsDir, String.valueOf(meetingId));
            Files.createDirectories(dir);
            String safeName = file.getOriginalFilename() == null ? "upload.bin" : file.getOriginalFilename();
            Path target = dir.resolve(safeName);
            file.transferTo(target);
            return target.toString();
        } catch (IOException e) {
            return null;
        }
    }

    private void saveAttendees(Long meetingId, List<String> participantNames) {
        for (String name : participantNames) {
            userRepository.findFirstByName(name)
                .ifPresent(user -> meetingAttendeeRepository.save(new MeetingAttendee(meetingId, user.getId())));
        }
    }

    private Long resolveAssignee(String assigneeIdParam) {
        if (assigneeIdParam == null || assigneeIdParam.isBlank()) return null;
        Long resolved = demoDataService.resolveUserId(assigneeIdParam);
        if (resolved != null) return resolved;
        try {
            return Long.parseLong(assigneeIdParam);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private LocalDate parseDateOrNull(String date) {
        if (date == null || date.isBlank()) return null;
        try {
            return LocalDate.parse(date);
        } catch (Exception e) {
            return null;
        }
    }

    private Long parseLongOrNull(String value) {
        try {
            return Long.parseLong(value);
        } catch (Exception e) {
            return null;
        }
    }

    private List<String> safeParticipants(List<String> participants) {
        if (participants == null) return List.of();
        return participants.stream().filter(p -> p != null && !p.isBlank()).toList();
    }

    private String extractText(MultipartFile file) {
        if (file == null || file.isEmpty()) return "";
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        boolean textLike = contentType.startsWith("text/")
            || name.endsWith(".txt")
            || name.endsWith(".md")
            || name.endsWith(".csv")
            || name.endsWith(".json");
        if (name.endsWith(".docx")) {
            return extractDocxText(file);
        }
        if (!textLike) {
            return "업로드 파일명: " + file.getOriginalFilename() + ". 바이너리 문서는 FastAPI 문서 파서 또는 STT 단계에서 텍스트 추출 예정.";
        }
        try {
            return new String(file.getBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return "";
        }
    }

    private String extractDocxText(MultipartFile file) {
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(file.getBytes()))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (!"word/document.xml".equals(entry.getName())) continue;
                String xml = new String(zip.readAllBytes(), StandardCharsets.UTF_8);
                return xml
                    .replaceAll("<w:p[^>]*>", "\n")
                    .replaceAll("<[^>]+>", " ")
                    .replace("&lt;", "<")
                    .replace("&gt;", ">")
                    .replace("&amp;", "&")
                    .replace("&quot;", "\"")
                    .replace("&apos;", "'")
                    .replaceAll("\\s+", " ")
                    .trim();
            }
        } catch (IOException ignored) {
            return "";
        }
        return "";
    }

    private String defaultString(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }
}
