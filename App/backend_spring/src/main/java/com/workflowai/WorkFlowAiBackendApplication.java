package com.workflowai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class WorkFlowAiBackendApplication {
    public static void main(String[] args) {
        DatabaseUrlPropertyMapper.apply();
        SpringApplication.run(WorkFlowAiBackendApplication.class, args);
    }
}
