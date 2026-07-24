package com.workflowai.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.project.ProjectRepository;
import com.workflowai.security.UserPrincipal;
import com.workflowai.storage.LocalFileStorageService;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

// LocalFileStorageService를 실제 빈으로 띄운다 — @WebMvcTest는 기본적으로 @Service 빈을
// 스캔하지 않지만, 이 테스트는 실제 파일이 @TempDir에 쓰이고 지워지는지까지 검증해야 하므로
// StorageService를 목(mock)으로 대체하지 않고 실제 로컬 구현체를 그대로 쓴다.
@WebMvcTest(MeController.class)
@Import(LocalFileStorageService.class)
@AutoConfigureMockMvc(addFilters = false)
class MeControllerTest {

    @TempDir
    static Path uploadsDir;

    @DynamicPropertySource
    static void uploadsDirProperty(DynamicPropertyRegistry registry) {
        registry.add("workflow.uploads.dir", () -> uploadsDir.toString());
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private ProjectMemberRepository projectMemberRepository;

    @MockitoBean
    private ProjectRepository projectRepository;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(long userId) {
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(
                new UserPrincipal(userId, "user" + userId + "@workflow.ai", "테스트유저"), null, List.of()
            )
        );
    }

    private User existingUser() {
        return new User("user1@workflow.ai", "김민준", "local", "user1@workflow.ai", "hash");
    }

    private static byte[] pngBytes() throws Exception {
        BufferedImage image = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    @Test
    void updateMe_rejectsDuplicateFieldTags() throws Exception {
        authenticateAs(1L);

        String body = objectMapper.writeValueAsString(
            new UpdateMeRequest(null, null, List.of("백엔드", "백엔드"), null)
        );

        mockMvc.perform(
                patch("/api/v1/me")
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .content(body)
            )
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    }

    @Test
    void updateMe_updatesAllowedFields() throws Exception {
        authenticateAs(1L);
        User user = existingUser();
        when(userRepository.findById(1L)).thenReturn(Optional.of(user));

        String body = objectMapper.writeValueAsString(
            new UpdateMeRequest("새이름", "컴퓨터공학과", List.of("백엔드", "인프라"), "octocat")
        );

        mockMvc.perform(
                patch("/api/v1/me")
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .content(body)
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.name").value("새이름"))
            .andExpect(jsonPath("$.data.githubUsername").value("octocat"));
    }

    @Test
    void uploadAvatar_rejectsEmptyFile() throws Exception {
        authenticateAs(1L);
        MockMultipartFile empty = new MockMultipartFile("file", "avatar.png", "image/png", new byte[0]);

        mockMvc.perform(multipart("/api/v1/me/avatar").file(empty))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("EMPTY_FILE"));
    }

    @Test
    void uploadAvatar_rejectsDisallowedContentType() throws Exception {
        authenticateAs(1L);
        MockMultipartFile gif = new MockMultipartFile("file", "avatar.gif", "image/gif", new byte[]{1, 2, 3});

        mockMvc.perform(multipart("/api/v1/me/avatar").file(gif))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("INVALID_FILE_TYPE"));
    }

    @Test
    void uploadAvatar_rejectsFileOver10MB() throws Exception {
        authenticateAs(1L);
        MockMultipartFile tooLarge = new MockMultipartFile(
            "file", "avatar.png", "image/png", new byte[11 * 1024 * 1024]
        );

        mockMvc.perform(multipart("/api/v1/me/avatar").file(tooLarge))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("FILE_TOO_LARGE"));
    }

    @Test
    void uploadAvatar_rejectsContentThatIsNotActuallyAnImage() throws Exception {
        authenticateAs(1L);
        MockMultipartFile fakePng = new MockMultipartFile(
            "file", "avatar.png", "image/png", "이건 이미지가 아니라 텍스트다".getBytes()
        );

        mockMvc.perform(multipart("/api/v1/me/avatar").file(fakePng))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("INVALID_FILE_TYPE"));
    }

    @Test
    void uploadAvatar_rejectsImageOverMaxDimension() throws Exception {
        authenticateAs(1L);
        BufferedImage oversizedImage = new BufferedImage(2001, 2001, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(oversizedImage, "png", out);
        MockMultipartFile oversized = new MockMultipartFile("file", "avatar.png", "image/png", out.toByteArray());

        mockMvc.perform(multipart("/api/v1/me/avatar").file(oversized))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("IMAGE_TOO_LARGE"));
    }

    @Test
    void uploadAvatar_succeedsAndUpdatesProfileImagePath() throws Exception {
        authenticateAs(1L);
        User user = existingUser();
        when(userRepository.findById(eq(1L))).thenReturn(Optional.of(user));
        when(userRepository.updateProfileImagePathIfUnchanged(eq(1L), any(), any())).thenReturn(1);

        MockMultipartFile validPng = new MockMultipartFile("file", "avatar.png", "image/png", pngBytes());

        mockMvc.perform(multipart("/api/v1/me/avatar").file(validPng))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.profileImageUrl").exists());

        assertThat(user.getProfileImagePath()).isNotBlank();
    }

    @Test
    void uploadAvatar_succeedsEvenWhenOldAvatarPathIsMalformed() throws Exception {
        authenticateAs(1L);
        User user = existingUser();
        // DB에 저장된 이전 경로가 손상/변조로 파일시스템이 허용하지 않는 문자(NUL, 코드 포인트
        // 0)를 담고 있는 경우를 흉내낸다 — Path.of()가 InvalidPathException(unchecked)을
        // 던지는 상황이라, 이전 파일 정리에 실패하더라도 요청 자체는 여전히 성공해야 한다(DB는
        // 새 경로로 이미 정확히 갱신됐으므로). 소스 코드에 제어 문자를 직접 적지 않도록
        // 런타임에 문자를 조립한다.
        char nulChar = (char) 0;
        user.setProfileImagePath("avatars/1-bad" + nulChar + "name.png");
        when(userRepository.findById(eq(1L))).thenReturn(Optional.of(user));
        when(userRepository.updateProfileImagePathIfUnchanged(eq(1L), any(), any())).thenReturn(1);

        MockMultipartFile validPng = new MockMultipartFile("file", "avatar.png", "image/png", pngBytes());

        mockMvc.perform(multipart("/api/v1/me/avatar").file(validPng))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.profileImageUrl").exists());
    }

    @Test
    void uploadAvatar_returnsConflictWhenPathChangedConcurrently() throws Exception {
        authenticateAs(1L);
        User user = existingUser();
        when(userRepository.findById(eq(1L))).thenReturn(Optional.of(user));
        // 0 = 그 사이 다른 요청이 먼저 profileImagePath를 바꿔서 compare-and-swap이 실패했다는 뜻.
        when(userRepository.updateProfileImagePathIfUnchanged(eq(1L), any(), any())).thenReturn(0);

        MockMultipartFile validPng = new MockMultipartFile("file", "avatar.png", "image/png", pngBytes());

        mockMvc.perform(multipart("/api/v1/me/avatar").file(validPng))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error.code").value("CONCURRENT_UPDATE"));
    }
}
