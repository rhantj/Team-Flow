package dashboard.DTO;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "카테고리별 업무 완료 현황")
public record CategoryProgressDto(
    @Schema(description = "카테고리", example = "백엔드") String category,
    @Schema(description = "전체 업무 수", example = "4") long total,
    @Schema(description = "완료 업무 수", example = "2") long done
) {
}
