package com.workflowai.task;

import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Supabase Storage REST API를 service_role 키로 직접 호출한다(공식 Java SDK가 없음).
 * service_role 키는 버킷 RLS를 무시하는 관리자 권한이라, "담당자만 업로드 가능" 같은 접근 제어는
 * 여기가 아니라 이 클라이언트를 호출하는 TaskResultController에서 해야 한다.
 */
@Component
public class SupabaseStorageClient {
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(30);

    private final RestClient restClient;
    private final String bucket;
    private final String storageBaseUrl;

    public SupabaseStorageClient(
        @Value("${workflow.supabase.url}") String supabaseUrl,
        @Value("${workflow.supabase.service-role-key}") String serviceRoleKey,
        @Value("${workflow.supabase.storage-bucket}") String bucket
    ) {
        this.bucket = bucket;
        this.storageBaseUrl = supabaseUrl + "/storage/v1";
        HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(CONNECT_TIMEOUT)
            .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        this.restClient = RestClient.builder()
            .baseUrl(supabaseUrl + "/storage/v1")
            .requestFactory(requestFactory)
            .defaultHeader("Authorization", "Bearer " + serviceRoleKey)
            .defaultHeader("apikey", serviceRoleKey)
            .build();
    }

    // 경로를 URI 템플릿의 {path} 변수 하나로 통째로 넘기면 Spring이 "/"까지 %2F로 이스케이프해버려서
    // Supabase가 서명에 쓴 경로와 실제 object 경로가 어긋나 "Invalid signature"가 났다. 아래 세 메서드는
    // 전부 .pathSegment(path.split("/"))로 세그먼트별로 붙여서 "/"는 구분자로 남기고 파일명 안의
    // 한글/공백 등 내용만 인코딩되게 한다.

    /** path는 버킷 하위 object 경로(예: tasks/42/uuid-파일명.pdf). */
    public void upload(String path, byte[] content, String contentType) {
        restClient.post()
            .uri(uriBuilder -> uriBuilder.path("/object/{bucket}").pathSegment(path.split("/")).build(bucket))
            .contentType(contentType != null ? MediaType.parseMediaType(contentType) : MediaType.APPLICATION_OCTET_STREAM)
            .body(content)
            .retrieve()
            .toBodilessEntity();
    }

    public void delete(String path) {
        restClient.delete()
            .uri(uriBuilder -> uriBuilder.path("/object/{bucket}").pathSegment(path.split("/")).build(bucket))
            .retrieve()
            .toBodilessEntity();
    }

    /**
     * 만료 시간이 있는 임시 다운로드 URL을 발급한다(버킷이 비공개라 직접 URL로는 못 받음).
     * downloadFileName을 지정하면 브라우저가 새 탭에 미리보기로 열지 않고 그 이름으로 바로
     * 다운로드하도록 Content-Disposition: attachment를 걸어준다 — sign 요청 바디가 아니라
     * 최종 URL에 &download= 쿼리 파라미터로 붙여야 적용된다(Supabase Storage REST API 특성).
     */
    public String createSignedUrl(String path, int expiresInSeconds, String downloadFileName) {
        SignedUrlResponse response = restClient.post()
            .uri(uriBuilder -> uriBuilder.path("/object/sign/{bucket}").pathSegment(path.split("/")).build(bucket))
            .contentType(MediaType.APPLICATION_JSON)
            .body(new SignedUrlRequest(expiresInSeconds))
            .retrieve()
            .body(SignedUrlResponse.class);
        if (response == null || response.signedURL() == null) {
            throw new IllegalStateException("Supabase가 signed URL을 반환하지 않았습니다: " + path);
        }
        // signedURL은 "/object/sign/{bucket}/{path}?token=..." 같은 상대 경로로 온다.
        String url = storageBaseUrl + response.signedURL();
        if (downloadFileName != null && !downloadFileName.isBlank()) {
            String encoded = URLEncoder.encode(downloadFileName, StandardCharsets.UTF_8);
            url += "&download=" + encoded;
        }
        return url;
    }

    private record SignedUrlRequest(int expiresIn) {}

    private record SignedUrlResponse(String signedURL) {}
}
