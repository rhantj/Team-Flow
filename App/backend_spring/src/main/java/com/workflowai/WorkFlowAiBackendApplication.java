package com.workflowai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

// dashboard/auth/global 패키지가 com.workflowai의 하위 패키지가 아니라 형제 패키지라
// 기본 컴포넌트/엔티티 스캔 범위(com.workflowai.*)에 들어오지 않는다. 새로 만든 dashboard
// 모듈이 실제로 빈으로 등록되도록 스캔 대상을 명시적으로 넓힌다.
@SpringBootApplication
@ConfigurationPropertiesScan
@ComponentScan(basePackages = {"com.workflowai", "dashboard"})
@EntityScan(basePackages = {"com.workflowai", "dashboard"})
@EnableJpaRepositories(basePackages = {"com.workflowai", "dashboard"})
public class WorkFlowAiBackendApplication {
    public static void main(String[] args) {
        DatabaseUrlPropertyMapper.apply();
        SpringApplication.run(WorkFlowAiBackendApplication.class, args);
    }
}
