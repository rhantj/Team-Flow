package com.workflowai.meeting;

import com.workflowai.common.ApiResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * com.workflowai.task.TaskAccessDeniedResponseAdvice와 내용은 같지만 이름을 다르게 둔다.
 * 여러 패키지의 @WebMvcTest들이 같은 클래스패스에서 동시에 도는데, @RestControllerAdvice 이름이 같으면
 * 기본 빈 이름 충돌(ConflictingBeanDefinitionException)이 난다.
 */
@RestControllerAdvice
class MeetingAnalysisAccessDeniedResponseAdvice {

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ApiResponse<Void>> handleAccessDenied() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body(ApiResponse.fail("FORBIDDEN", "권한이 없습니다."));
    }
}
