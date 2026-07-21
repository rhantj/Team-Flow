package com.workflowai.task;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** LLM 없이 카테고리 템플릿 + 업무 설명 문장 추출로 체크리스트 후보를 만드는 기본 구현체. */
@Component
public class RuleBasedChecklistGenerator implements ChecklistGenerator {
    private static final int MAX_ITEMS = 5;
    private static final String DEFAULT_CATEGORY = "other";

    private static final Map<String, List<String>> CATEGORY_TEMPLATES = new LinkedHashMap<>();

    static {
        CATEGORY_TEMPLATES.put("planning", List.of("요구사항 정리", "기능 정의 문서화", "일정 계획 수립"));
        CATEGORY_TEMPLATES.put("research", List.of("경쟁 서비스 조사", "참고 자료 정리", "핵심 인사이트 도출"));
        CATEGORY_TEMPLATES.put("ux-ui", List.of("사용자 흐름 설계", "와이어프레임 작성", "Figma 시안 공유"));
        CATEGORY_TEMPLATES.put("design", List.of("디자인 시안 제작", "컬러/폰트 가이드 확정", "참고 이미지 정리"));
        CATEGORY_TEMPLATES.put("frontend", List.of("화면 컴포넌트 구현", "API 연동", "반응형 스타일 확인"));
        CATEGORY_TEMPLATES.put("backend", List.of("API 명세 확정", "예외 처리 작성", "단위 테스트 작성", "Swagger 문서화"));
        CATEGORY_TEMPLATES.put("ai-ml", List.of("데이터셋 준비", "모델 학습 실행", "성능 지표 확인"));
        CATEGORY_TEMPLATES.put("data", List.of("데이터 수집", "전처리 및 정제", "라벨링 확인"));
        CATEGORY_TEMPLATES.put("db", List.of("테이블 설계", "ERD 작성", "인덱스 적용 확인"));
        CATEGORY_TEMPLATES.put("devops", List.of("배포 환경 구성", "CI/CD 파이프라인 설정", "배포 테스트"));
        CATEGORY_TEMPLATES.put("github", List.of("브랜치 생성", "PR 작성", "코드 리뷰 반영"));
        CATEGORY_TEMPLATES.put("qa", List.of("테스트 케이스 작성", "기능 테스트 수행", "버그 리포트 작성"));
        CATEGORY_TEMPLATES.put("security", List.of("취약점 점검", "인증/인가 검토", "조치 방안 문서화"));
        CATEGORY_TEMPLATES.put("docs", List.of("문서 초안 작성", "내용 검토", "최종본 정리"));
        CATEGORY_TEMPLATES.put("presentation", List.of("발표 목차 구성", "슬라이드 제작", "발표 대본 작성"));
        CATEGORY_TEMPLATES.put("deliverable", List.of("산출물 목차 정리", "초안 작성", "최종 검수"));
        CATEGORY_TEMPLATES.put("operation", List.of("제출처 확인", "제출 파일 준비", "마감 시간 확인"));
        CATEGORY_TEMPLATES.put(DEFAULT_CATEGORY, List.of("요구사항 확인", "작업 진행", "결과 검토"));
    }

    @Override
    public List<String> generate(Task task) {
        List<String> template = CATEGORY_TEMPLATES.getOrDefault(task.getCategory(), CATEGORY_TEMPLATES.get(DEFAULT_CATEGORY));
        List<String> items = new ArrayList<>(template);
        for (String sentence : extractSentences(task.getDescription())) {
            if (items.size() >= MAX_ITEMS) break;
            if (!items.contains(sentence)) items.add(sentence);
        }
        return items.size() > MAX_ITEMS ? items.subList(0, MAX_ITEMS) : items;
    }

    private List<String> extractSentences(String description) {
        if (description == null || description.isBlank()) return List.of();
        List<String> sentences = new ArrayList<>();
        for (String raw : description.split("[.!?\\n]")) {
            String s = raw.trim();
            if (s.length() >= 2 && s.length() <= 40) sentences.add(s);
        }
        return sentences;
    }
}
