package com.workflowai.meetingai;

import com.workflowai.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 회의록 AI 담당 API 계약(API-029 ~ API-035)만 다룬다.
 * DB/FastAPI 연동 전 단계이므로 모든 응답은 고정된 샘플 데이터를 반환한다.
 * 대시보드/업무보드 API는 이 컨트롤러의 범위 밖이다.
 */
@Tag(
    name = "회의록 AI",
    description = "회의록 업로드, AI 분석, 분석 결과 조회, To-Do 후보 승인 및 업무 등록 API"
)
@RestController
@RequestMapping("/api/v1")
public class MeetingAiController {

    @Operation(
        summary = "회의록 목록 조회",
        description = "API-029. 프로젝트에 등록된 회의록 목록을 조회한다. 권한: 팀장, 팀원, 심사자."
    )
    @GetMapping("/projects/{projectId}/meetings")
    public ApiResponse<MeetingListResponse> getMeetings(
        @Parameter(description = "프로젝트 ID", example = "1") @PathVariable Long projectId
    ) {
        List<MeetingSummaryResponse> meetings = List.of(
            new MeetingSummaryResponse(1L, "7차 정기회의", "2026-07-09", "정기회의", "ANALYZED"),
            new MeetingSummaryResponse(2L, "8차 정기회의", "2026-07-16", "정기회의", "PENDING")
        );
        return ApiResponse.ok(new MeetingListResponse(projectId, meetings));
    }

    @Operation(
        summary = "회의록 업로드",
        description = "API-030. 회의록 파일을 업로드하고 회의록 레코드를 생성한다. 권한: 팀장, 팀원."
    )
    @PostMapping(value = "/projects/{projectId}/meetings/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<MeetingUploadResponse> uploadMeeting(
        @Parameter(description = "프로젝트 ID", example = "1") @PathVariable Long projectId,
        @Parameter(description = "회의록 파일") @RequestPart(value = "file", required = false) MultipartFile file,
        @Parameter(description = "파일 유형", example = "document") @RequestParam(required = false) String fileType,
        @Parameter(description = "회의 제목", example = "7차 정기회의") @RequestParam(required = false) String title,
        @Parameter(description = "회의 날짜", example = "2026-07-09") @RequestParam(required = false) String meetingDate,
        @Parameter(description = "회의 유형", example = "정기회의") @RequestParam(required = false) String meetingKind,
        @Parameter(description = "참석자 ID 목록", example = "[1, 2, 3]") @RequestParam(required = false) List<Long> participantIds
    ) {
        Long meetingId = 1L;
        String fileName = file != null && file.getOriginalFilename() != null ? file.getOriginalFilename() : "meeting-upload.pdf";
        String filePath = "/uploads/meetings/%d/%s".formatted(meetingId, fileName);
        return ApiResponse.ok(new MeetingUploadResponse(meetingId, filePath));
    }

    @Operation(
        summary = "회의록 AI 분석 요청",
        description = "API-031. 업로드된 회의록에 대한 AI 분석 작업을 시작한다. 권한: 팀장, 팀원."
    )
    @PostMapping("/ai/meetings/{meetingId}/analyze")
    public ApiResponse<AnalyzeMeetingResponse> analyzeMeeting(
        @Parameter(description = "회의록 ID", example = "1") @PathVariable Long meetingId
    ) {
        return ApiResponse.ok(new AnalyzeMeetingResponse("job-" + (1000 + meetingId), "IN_PROGRESS"));
    }

    @Operation(
        summary = "회의록 분석 작업 상태 조회",
        description = "API-032. AI 분석 작업의 진행 상태와 진행률을 조회한다. 권한: 팀장, 팀원."
    )
    @GetMapping("/ai/jobs/{jobId}")
    public ApiResponse<AnalysisJobResponse> getAnalysisJob(
        @Parameter(description = "분석 작업 ID", example = "job-1001") @PathVariable String jobId
    ) {
        return ApiResponse.ok(new AnalysisJobResponse(jobId, "COMPLETED", 100));
    }

    @Operation(
        summary = "회의록 분석 결과 조회",
        description = "API-033. 회의록 AI 분석 결과(요약, 결정사항, 위험요소, To-Do 후보)를 조회한다. 권한: 팀장, 팀원, 심사자."
    )
    @GetMapping("/meetings/{meetingId}/analysis")
    public ApiResponse<MeetingAnalysisResponse> getMeetingAnalysis(
        @Parameter(description = "회의록 ID", example = "1") @PathVariable Long meetingId
    ) {
        return ApiResponse.ok(sampleAnalysis(meetingId));
    }

    @Operation(
        summary = "To-Do 후보 승인",
        description = "API-034. 팀장이 선택한 To-Do 후보를 실제 업무로 등록한다. 권한: 팀장."
    )
    @PostMapping("/meetings/{meetingId}/action-items/approve")
    public ApiResponse<ApproveActionItemsResponse> approveActionItems(
        @Parameter(description = "회의록 ID", example = "1") @PathVariable Long meetingId,
        @RequestBody ApproveActionItemsRequest request
    ) {
        List<String> ids = request.actionItemIds() != null ? request.actionItemIds() : List.of();
        List<String> createdTaskIds = ids.stream()
            .map(id -> "TASK-" + (1000 + Math.abs(id.hashCode() % 900)))
            .toList();
        return ApiResponse.ok(new ApproveActionItemsResponse(createdTaskIds));
    }

    @Operation(
        summary = "To-Do 후보 담당자/마감일 수정",
        description = "API-035. 팀장이 To-Do 후보의 담당자와 마감일을 수정한다. 권한: 팀장."
    )
    @PutMapping("/meetings/action-items/{actionItemId}/assignee")
    public ApiResponse<UpdateActionItemAssigneeResponse> updateActionItemAssignee(
        @Parameter(description = "액션 아이템 ID", example = "AI-TODO-001") @PathVariable String actionItemId,
        @RequestBody UpdateActionItemAssigneeRequest request
    ) {
        ActionItemResponse updated = new ActionItemResponse(
            actionItemId,
            "발표자료 초안 작성",
            "회의에서 논의된 발표자료 목차를 기반으로 초안을 작성한다.",
            "presentation",
            request.assigneeId(),
            "팀원",
            request.dueDate(),
            "HIGH",
            "PENDING_APPROVAL",
            "MEETING_AI",
            1L
        );
        return ApiResponse.ok(new UpdateActionItemAssigneeResponse(updated));
    }

    private MeetingAnalysisResponse sampleAnalysis(Long meetingId) {
        ActionItemResponse actionItem = new ActionItemResponse(
            "AI-TODO-001",
            "발표자료 초안 작성",
            "회의에서 논의된 발표자료 목차를 기반으로 초안을 작성한다.",
            "presentation",
            1L,
            "김민준",
            "2026-07-15",
            "HIGH",
            "PENDING_APPROVAL",
            "MEETING_AI",
            meetingId
        );
        return new MeetingAnalysisResponse(
            meetingId,
            "7차 정기회의",
            "이번 회의에서는 발표자료 작성, 백엔드 API 연결, 테스트 일정이 논의되었습니다.",
            List.of(
                "발표자료 초안은 7월 15일까지 작성한다.",
                "회의록 AI가 생성한 To-Do는 팀장이 승인한 뒤 업무로 등록한다."
            ),
            List.of("담당자가 지정되지 않은 업무는 일정 지연 가능성이 있다."),
            List.of(actionItem)
        );
    }
}
