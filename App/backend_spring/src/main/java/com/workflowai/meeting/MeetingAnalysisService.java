package com.workflowai.meeting;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MeetingAnalysisService {
    private final FastApiMeetingClient fastApiMeetingClient;
    private final FallbackMeetingAnalyzer fallbackMeetingAnalyzer;
    private final Map<String, MeetingAnalysisResponse> store = new ConcurrentHashMap<>();

    public MeetingAnalysisService(
        FastApiMeetingClient fastApiMeetingClient,
        FallbackMeetingAnalyzer fallbackMeetingAnalyzer
    ) {
        this.fastApiMeetingClient = fastApiMeetingClient;
        this.fallbackMeetingAnalyzer = fallbackMeetingAnalyzer;
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
        String fileName = file == null ? null : file.getOriginalFilename();
        String text = extractText(file);
        AiAnalyzeRequest request = new AiAnalyzeRequest(
            projectId,
            defaultString(title, "회의록 AI 분석 회의"),
            defaultString(meetingDate, LocalDate.now().toString()),
            defaultString(meetingKind, "정기회의"),
            defaultString(sourceType, "document"),
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

        String meetingId = "meeting-" + UUID.randomUUID();
        MeetingAnalysisResponse response = new MeetingAnalysisResponse(
            meetingId,
            projectId,
            "COMPLETED",
            request.source_type(),
            fileName,
            analysisSource,
            result
        );
        store.put(meetingId, response);
        return response;
    }

    public MeetingAnalysisResponse find(String meetingId) {
        return store.get(meetingId);
    }

    public TaskRegisterResponse registerTasks(String meetingId, TaskRegisterRequest request) {
        int count = request == null || request.todos() == null ? 0 : request.todos().size();
        return new TaskRegisterResponse(meetingId, count, "TODO");
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
