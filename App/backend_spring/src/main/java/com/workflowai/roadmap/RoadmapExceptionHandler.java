package com.workflowai.roadmap;

import com.workflowai.common.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = RoadmapController.class)
public class RoadmapExceptionHandler {
    @ExceptionHandler(RoadmapException.class)
    public ResponseEntity<ApiResponse<Void>> handle(RoadmapException exception) {
        return ResponseEntity.status(exception.getStatus())
            .body(ApiResponse.fail(exception.getCode(), exception.getMessage()));
    }
}
