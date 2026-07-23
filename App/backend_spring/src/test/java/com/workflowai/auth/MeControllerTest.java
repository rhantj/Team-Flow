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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(MeController.class)
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
        BufferedImage oversizedImage = new BufferedImage(201, 201, BufferedImage.TYPE_INT_RGB);
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
        when(userRepository.saveAndFlush(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        MockMultipartFile validPng = new MockMultipartFile("file", "avatar.png", "image/png", pngBytes());

        mockMvc.perform(multipart("/api/v1/me/avatar").file(validPng))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.profileImageUrl").exists());

        assertThat(user.getProfileImagePath()).isNotBlank();
    }
}
