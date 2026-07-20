package dashboard.DTO;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "팀원별 업무량")
public record WorkloadEntryDto(
    @Schema(description = "담당자 ID", example = "1") String assigneeId,
    @Schema(description = "담당자 이름", example = "김민준") String assigneeName,
    @Schema(description = "전체 업무 수", example = "10") long total,
    @Schema(description = "완료 업무 수", example = "8") long done,
    @Schema(description = "대기 업무 수", example = "1") long todo,
    @Schema(description = "진행 중 업무 수", example = "1") long inProgress,
    @Schema(description = "블로커 업무 수", example = "0") long blocked
) {
}
