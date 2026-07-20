package com.workflowai.meeting;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class FallbackMeetingAnalyzer {
    private static final List<Pattern> ASSIGNEE_PATTERNS = List.of(
        Pattern.compile("^([가-힣]{2,4})(?:은|는|이|가)\\s"),
        Pattern.compile("담당[:\\s]+([가-힣]{2,4})")
    );
    public MeetingAnalysisResult analyze(AiAnalyzeRequest request) {
        List<String> participants = safeParticipants(request.participants());
        String title = blankToDefault(request.title(), "회의록 AI 분석 회의");
        String date = blankToDefault(request.meeting_date(), LocalDate.now().toString());
        String text = blankToDefault(request.text(), title + " 회의 내용");

        List<String> decisions = extractSentences(text, List.of("확정", "결정", "통일", "진행", "사용"), 5);
        if (decisions.isEmpty()) {
            decisions = List.of(
                "회의록 분석 결과는 요약, 결정사항, To-Do, 위험요소 형식으로 정리한다.",
                "생성된 To-Do는 팀장 검토 후 업무 보드에 등록한다."
            );
        }

        List<String> risks = extractSentences(text, List.of("위험", "지연", "부족", "오류", "실패", "불안정"), 4);
        if (risks.isEmpty()) {
            risks = List.of("담당자와 마감일이 명확하지 않은 업무는 일정 지연으로 이어질 수 있다.");
        }

        List<MeetingTodo> todos = buildTodos(text, date);
        String summary = "%s에서 논의된 내용을 분석해 핵심 결정사항 %d건, To-Do %d건, 위험요소 %d건을 추출했다."
            .formatted(title, decisions.size(), todos.size(), risks.size());

        return new MeetingAnalysisResult(
            summary,
            decisions,
            todos,
            risks,
            keywords(text, request.source_type()),
            new MeetingMeta(title, date, participants)
        );
    }

    private List<MeetingTodo> buildTodos(String text, String date) {
        List<String> taskSentences = extractSentences(text, List.of("담당", "작성", "구현", "정리", "검토", "준비", "연결", "테스트"), 6);
        if (taskSentences.isEmpty()) {
            taskSentences = List.of(
                "회의록 AI 분석 API 구현",
                "분석 결과 화면과 업무 보드 등록 흐름 연결",
                "팀장 검토용 To-Do 승인 화면 점검"
            );
        }

        List<MeetingTodo> todos = new ArrayList<>();
        for (int i = 0; i < taskSentences.size(); i++) {
            String sentence = taskSentences.get(i);
            String assignee = extractAssigneeCandidate(sentence);
            todos.add(new MeetingTodo(
                shorten(sentence, 42),
                sentence,
                assignee,
                null,
                LocalDate.parse(date).plusDays(3L + i).toString(),
                i < 2 ? "HIGH" : "MEDIUM",
                inferCategory(sentence),
                true
            ));
        }
        return todos;
    }

    /** 문장에서 "OO가/은/는 ~한다" 또는 "담당: OO" 형태로 적힌 담당자 이름을 추출한다. 없으면 빈 문자열(미배정 후보). */
    private String extractAssigneeCandidate(String sentence) {
        String trimmed = sentence.trim();
        for (Pattern pattern : ASSIGNEE_PATTERNS) {
            Matcher matcher = pattern.matcher(trimmed);
            if (matcher.find()) {
                return matcher.group(1);
            }
        }
        return "";
    }

    private List<String> extractSentences(String text, List<String> keywords, int limit) {
        List<String> found = new ArrayList<>();
        for (String sentence : text.split("[\\n.。!?！？]")) {
            String trimmed = sentence.trim();
            if (trimmed.length() < 6) continue;
            for (String keyword : keywords) {
                if (trimmed.contains(keyword)) {
                    found.add(shorten(trimmed, 120));
                    break;
                }
            }
            if (found.size() >= limit) break;
        }
        return found;
    }

    private String inferCategory(String sentence) {
        String lower = sentence.toLowerCase();
        if (lower.contains("api") || sentence.contains("백엔드") || sentence.contains("서버")) return "BACKEND";
        if (sentence.contains("화면") || sentence.contains("UI") || sentence.contains("프론트")) return "FRONTEND";
        if (sentence.contains("모델") || sentence.contains("AI") || sentence.contains("분석")) return "AI";
        if (sentence.contains("테스트") || sentence.contains("검수")) return "QA";
        if (sentence.contains("발표") || sentence.contains("PPT")) return "PRESENTATION";
        if (sentence.contains("문서") || sentence.contains("보고서")) return "DOCUMENT";
        return "ETC";
    }

    private List<String> keywords(String text, String sourceType) {
        Set<String> keywords = new LinkedHashSet<>();
        keywords.add("회의록 AI");
        keywords.add(sourceType == null ? "문서 업로드" : sourceType);
        for (String candidate : List.of("Spring Boot", "FastAPI", "To-Do", "업무 보드", "대시보드", "기여도", "해커톤", "공모전", "캡스톤")) {
            if (text.contains(candidate)) keywords.add(candidate);
        }
        return new ArrayList<>(keywords);
    }

    private List<String> safeParticipants(List<String> participants) {
        if (participants == null) return List.of();
        return participants.stream().filter(p -> p != null && !p.isBlank()).toList();
    }

    private String blankToDefault(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }

    private String shorten(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max - 1) + "…";
    }
}
