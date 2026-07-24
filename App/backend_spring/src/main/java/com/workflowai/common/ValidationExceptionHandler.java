package com.workflowai.common;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * @Valid 검증 실패를 기본 핸들러(DefaultHandlerExceptionResolver)에 맡기면
 * response.sendError()가 내부적으로 /error로 재디스패치하는데, 이 과정에서 Spring Security의
 * 인증 컨텍스트가 이어지지 않아 400 대신 401(UNAUTHORIZED)이 잘못 반환된다.
 * 여기서 직접 400 응답을 만들어 반환해 이 문제를 피한다.
 */
@RestControllerAdvice
public class ValidationExceptionHandler {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException ex) {
        FieldError fieldError = ex.getBindingResult().getFieldError();
        String message = fieldError != null && fieldError.getDefaultMessage() != null
            ? fieldError.getDefaultMessage()
            : "요청 값이 올바르지 않습니다.";
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(ApiResponse.fail("VALIDATION_FAILED", message));
    }
}
