package com.workflowai.meeting;

import com.workflowai.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Tag(
    name = "회의록 AI",
    description = "회의록 업로드, AI 분석, 분석 결과 조회, To-Do 후보 승인 및 업무 등록 API"
)
@RestController
@RequestMapping("/api/v1/projects/{projectId}/meetings")
public class MeetingAnalysisController {
    private final MeetingAnalysisService meetingAnalysisService;

    public MeetingAnalysisController(MeetingAnalysisService meetingAnalysisService) {
        this.meetingAnalysisService = meetingAnalysisService;
    }

    @Operation(
        summary = "회의록 AI 분석 요청",
        description = "업로드된 회의록 파일 또는 텍스트를 기반으로 AI 분석을 실행하고 회의 요약, 결정사항, 위험요소, To-Do 후보를 생성합니다. "
            + "FastAPI 분석 서버 호출에 실패하면 Spring 내장 fallback 분석기가 기본 분석 결과를 반환합니다."
    )
    @PostMapping(value = "/analyze", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<MeetingAnalysisResponse> analyze(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "회의록 원본 파일 (문서/음성/영상)") @RequestPart(value = "file", required = false) MultipartFile file,
        @Parameter(description = "회의 제목", example = "7차 정기회의") @RequestParam(value = "title", required = false) String title,
        @Parameter(description = "회의 날짜 (YYYY-MM-DD)", example = "2026-07-09") @RequestParam(value = "meetingDate", required = false) String meetingDate,
        @Parameter(description = "회의 유형", example = "정기회의") @RequestParam(value = "meetingKind", required = false) String meetingKind,
        @Parameter(description = "업로드 파일 유형", example = "document", schema = @Schema(allowableValues = {"document", "audio", "video"})) @RequestParam(value = "sourceType", required = false) String sourceType,
        @Parameter(description = "참석자 이름 목록", example = "[\"김민준\", \"이서연\"]") @RequestParam(value = "participants", required = false) List<String> participants
    ) {
        return ApiResponse.ok(meetingAnalysisService.analyze(
            projectId,
            file,
            title,
            meetingDate,
            meetingKind,
            sourceType,
            participants
        ));
    }

    @Operation(
        summary = "회의록 분석 결과 조회",
        description = "특정 회의록의 AI 분석 결과와 생성된 To-Do 후보 목록을 조회합니다."
    )
    @GetMapping("/{meetingId}")
    public ResponseEntity<ApiResponse<MeetingAnalysisResponse>> getMeeting(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "회의록 ID", example = "demo-project-1") @PathVariable String meetingId
    ) {
        MeetingAnalysisResponse response = meetingAnalysisService.find(meetingId);
        if (response == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("MEETING_NOT_FOUND", "회의록 분석 결과를 찾을 수 없습니다."));
        }
        return ResponseEntity.ok(ApiResponse.ok(response));
    }

    @Operation(
        summary = "회의록 To-Do 업무 등록",
        description = "팀장이 승인한 회의록 기반 To-Do 후보를 실제 업무(Task)로 등록합니다. 등록된 업무는 업무보드와 대시보드에서 사용할 수 있습니다."
    )
    @PostMapping("/{meetingId}/tasks/register")
    public ApiResponse<TaskRegisterResponse> registerTasks(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "회의록 ID", example = "demo-project-1") @PathVariable String meetingId,
        @RequestBody TaskRegisterRequest request
    ) {
        return ApiResponse.ok(meetingAnalysisService.registerTasks(meetingId, request));
    }
}
