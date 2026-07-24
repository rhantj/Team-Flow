package com.workflowai.common;

import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** workflow.uploads.dir 아래 저장된 파일(프로필 사진 등)을 /uploads/**로 정적 서빙한다. */
@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final String uploadsDir;

    public WebConfig(@Value("${workflow.uploads.dir}") String uploadsDir) {
        this.uploadsDir = uploadsDir;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = Path.of(uploadsDir).toAbsolutePath().normalize().toUri().toString();
        registry.addResourceHandler("/uploads/**").addResourceLocations(location);
    }
}
