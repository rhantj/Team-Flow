package com.workflowai.evaluation;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflowai.common.GlobalExceptionHandler;
import com.workflowai.project.ProjectMemberRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EvaluationScoreControllerTest {

    @Mock
    private EvaluationScoreRepository evaluationScoreRepository;

    @Mock
    private ProjectMemberRepository projectMemberRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private MockMvc mockMvc() {
        return MockMvcBuilders
            .standaloneSetup(new EvaluationScoreController(evaluationScoreRepository, projectMemberRepository))
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();
    }

    @Test
    void upsertSavesReviewerScoreAndGradeFromCalculator() throws Exception {
        when(projectMemberRepository.existsByProjectIdAndUserId(1L, 3L)).thenReturn(true);
        when(evaluationScoreRepository.findByProjectIdAndUserId(1L, 3L)).thenReturn(Optional.empty());
        when(evaluationScoreRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        EvaluationScoreRequest request = new EvaluationScoreRequest(
            1L, 3L, new BigDecimal("77.20"), false, new BigDecimal("90.00"), "A+"
        );

        mockMvc().perform(post("/api/v1/projects/1/evaluations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.score").value(77.20))
            .andExpect(jsonPath("$.data.reviewerScore").value(90.00))
            .andExpect(jsonPath("$.data.grade").value("A+"));
    }

    @Test
    void upsertKeepsExistingScoreReviewerScoreAndGradeWhenTogglingPublicOnly() throws Exception {
        // 메인 테이블의 공개/비공개 토글은 score/reviewerScore/grade 없이 호출된다 —
        // 이미 학점 계산기에서 저장해 둔 총점(score)/심사자점수/학점을 덮어쓰면 안 된다.
        // (회귀 테스트: 과거 버그 — 공개 토글이 기여 점수를 score로 다시 보내 총점을 덮어썼다)
        EvaluationScore existing = new EvaluationScore(1L, 3L, new BigDecimal("77.20"), false);
        existing.setReviewerScore(new BigDecimal("90.00"));
        existing.setGrade("A+");
        when(projectMemberRepository.existsByProjectIdAndUserId(1L, 3L)).thenReturn(true);
        when(evaluationScoreRepository.findByProjectIdAndUserId(1L, 3L)).thenReturn(Optional.of(existing));
        when(evaluationScoreRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        EvaluationScoreRequest request = new EvaluationScoreRequest(
            1L, 3L, null, true, null, null
        );

        mockMvc().perform(post("/api/v1/projects/1/evaluations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.isPublic").value(true))
            .andExpect(jsonPath("$.data.score").value(77.20))
            .andExpect(jsonPath("$.data.reviewerScore").value(90.00))
            .andExpect(jsonPath("$.data.grade").value("A+"));
    }

    @Test
    void upsertReturns400WhenUserIsNotProjectMember() throws Exception {
        when(projectMemberRepository.existsByProjectIdAndUserId(1L, 999L)).thenReturn(false);

        EvaluationScoreRequest request = new EvaluationScoreRequest(
            1L, 999L, new BigDecimal("50.00"), false, null, null
        );

        mockMvc().perform(post("/api/v1/projects/1/evaluations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("USER_NOT_PROJECT_MEMBER"));
    }

    @Test
    void upsertReturns400WhenScoreOutOfRange() throws Exception {
        EvaluationScoreRequest request = new EvaluationScoreRequest(
            1L, 3L, new BigDecimal("150.00"), false, null, null
        );

        mockMvc().perform(post("/api/v1/projects/1/evaluations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));
    }

    @Test
    void upsertReturns400WhenReviewerScoreOutOfRange() throws Exception {
        EvaluationScoreRequest request = new EvaluationScoreRequest(
            1L, 3L, null, false, new BigDecimal("-1"), null
        );

        mockMvc().perform(post("/api/v1/projects/1/evaluations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));
    }

    @Test
    void upsertReturns400WhenGradeNotInAllowedList() throws Exception {
        EvaluationScoreRequest request = new EvaluationScoreRequest(
            1L, 3L, null, false, null, "S+"
        );

        mockMvc().perform(post("/api/v1/projects/1/evaluations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));
    }

    @Test
    void upsertAcceptsAGradeVariantWithoutTrailingZero() throws Exception {
        // A0 대신 A만 쓰는 학교 표기(A/B/C/D)도 허용해야 한다.
        when(projectMemberRepository.existsByProjectIdAndUserId(1L, 3L)).thenReturn(true);
        when(evaluationScoreRepository.findByProjectIdAndUserId(1L, 3L)).thenReturn(Optional.empty());
        when(evaluationScoreRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        EvaluationScoreRequest request = new EvaluationScoreRequest(
            1L, 3L, new BigDecimal("60.00"), false, null, "A"
        );

        mockMvc().perform(post("/api/v1/projects/1/evaluations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.grade").value("A"));
    }

    @Test
    void listReturnsReviewerScoreAndGradeFields() throws Exception {
        EvaluationScore saved = new EvaluationScore(1L, 3L, new BigDecimal("77.20"), true);
        saved.setReviewerScore(new BigDecimal("90.00"));
        saved.setGrade("A+");
        when(evaluationScoreRepository.findAllByProjectId(1L)).thenReturn(List.of(saved));

        mockMvc().perform(get("/api/v1/projects/1/evaluations"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].reviewerScore").value(90.00))
            .andExpect(jsonPath("$.data[0].grade").value("A+"));
    }
}
