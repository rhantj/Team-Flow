package com.workflowai.auth;

import com.workflowai.common.ApiResponse;
import com.workflowai.project.Project;
import com.workflowai.project.ProjectMember;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.project.ProjectRepository;
import com.workflowai.security.CurrentUser;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.stream.Collectors;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Tag(name = "내 정보", description = "현재 로그인한 사용자의 기본 정보 및 역할 요약")
@RestController
@RequestMapping("/api/v1/me")
public class MeController {
    private static final Set<String> ALLOWED_AVATAR_TYPES = Set.of("image/png", "image/jpeg");
    private static final long MAX_AVATAR_BYTES = 10L * 1024 * 1024;
    private static final int MAX_AVATAR_DIMENSION = 2000;

    private final UserRepository userRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final ProjectRepository projectRepository;
    private final String uploadsDir;

    // 아바타 이미지 전체 디코딩(detectImageFormat)은 요청당 최대 ~16MB 버퍼(MAX_AVATAR_DIMENSION
    // 참고)를 잡는다 — 개별 요청은 그 정도로 제한되지만, 동시에 들어오는 요청 수 자체에는
    // 상한이 없으면 병렬 업로드가 몰릴 때 인스턴스 메모리가 요청 수만큼 곱해져 고갈될 수 있다.
    // 인스턴스당 동시 디코딩 개수를 세마포로 제한해(디코딩 시작 "전에" 확인) 그 상한을 건다 —
    // 초과분은 무거운 디코딩을 아예 시작하지 않고 429로 즉시 돌려보낸다.
    private static final int MAX_CONCURRENT_AVATAR_DECODES = 8;
    private final Semaphore avatarDecodeSemaphore = new Semaphore(MAX_CONCURRENT_AVATAR_DECODES);

    public MeController(
        UserRepository userRepository,
        ProjectMemberRepository projectMemberRepository,
        ProjectRepository projectRepository,
        @Value("${workflow.uploads.dir}") String uploadsDir
    ) {
        this.userRepository = userRepository;
        this.projectMemberRepository = projectMemberRepository;
        this.projectRepository = projectRepository;
        this.uploadsDir = uploadsDir;
    }

    @Operation(summary = "내 정보 조회", description = "현재 로그인한 사용자의 기본 정보와 프로젝트별 역할을 조회한다.")
    @GetMapping
    public ApiResponse<MeResponse> me() {
        User user = userRepository.findById(CurrentUser.id())
            .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));

        List<ProjectMember> memberships = projectMemberRepository.findAllByUserId(user.getId());
        Map<Long, Project> projectsById = projectRepository
            .findAllById(memberships.stream().map(ProjectMember::getProjectId).toList())
            .stream()
            .collect(Collectors.toMap(Project::getId, project -> project));

        List<ProjectRoleSummary> projectRoles = memberships.stream()
            .map(pm -> {
                Project project = projectsById.get(pm.getProjectId());
                String title = project != null ? project.getTitle() : null;
                return new ProjectRoleSummary(pm.getProjectId(), title, pm.getRole().toKorean());
            })
            .toList();

        return ApiResponse.ok(new MeResponse(UserSummary.from(user), projectRoles));
    }

    @Operation(
        summary = "내 정보 수정",
        description = "이름/소속/분야/GitHub 아이디를 수정한다. 요청에 없는(null) 필드는 기존 값을 유지한다."
    )
    @PatchMapping
    @Transactional
    public ResponseEntity<ApiResponse<UserSummary>> updateMe(@Valid @RequestBody UpdateMeRequest request) {
        // 개별 태그의 공백/길이는 @Valid(UpdateMeRequest)가 걸러내지만, 중복 태그는 Bean Validation
        // 표준 제약만으로 표현하기 번거로워 여기서 직접 확인한다.
        if (request.field() != null && new HashSet<>(request.field()).size() != request.field().size()) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("VALIDATION_FAILED", "분야 태그가 중복되었습니다."));
        }

        User user = userRepository.findById(CurrentUser.id())
            .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));

        if (request.name() != null) {
            user.setName(request.name());
        }
        if (request.affiliation() != null) {
            user.setAffiliation(request.affiliation());
        }
        if (request.field() != null) {
            user.setField(request.field());
        }
        if (request.githubUsername() != null) {
            user.setGithubUsername(request.githubUsername());
        }

        return ResponseEntity.ok(ApiResponse.ok(UserSummary.from(user)));
    }

    @Operation(
        summary = "프로필 사진 업로드",
        description = "PNG/JPG만 허용하며 최대 10MB까지 업로드할 수 있다. 기존 사진이 있으면 교체된다."
    )
    // 의도적으로 @Transactional을 붙이지 않는다 — 이 메서드에 붙이면 updateProfileImagePathIfUnchanged가
    // 그 트랜잭션에 참여(participate)하게 되어, 호출 이후 메서드가 정상 반환되더라도 실제 커밋은
    // 메서드가 끝난 뒤 트랜잭션 경계에서 일어난다. 그러면 "DB 반영 확인 후 이전 파일 삭제"가
    // 실제로는 커밋 전에 실행되는 셈이라, 이후 커밋이 실패하면 DB는 이전 경로로 롤백되는데 그
    // 파일은 이미 지워진 상태가 된다. @Transactional 없이 두면 그 리포지토리 메서드 호출 자체가
    // 자기 완결적인 트랜잭션으로 실행되어, 이 메서드 안에서 예외 없이 반환됐다는 것 = 실제로
    // 커밋까지 끝났다는 뜻이 된다.
    @PostMapping(value = "/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<UserSummary>> uploadAvatar(
        @Parameter(description = "프로필 사진 파일 (PNG/JPG, 최대 10MB)") @RequestPart("file") MultipartFile file
    ) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("EMPTY_FILE", "파일을 선택해주세요."));
        }
        if (!ALLOWED_AVATAR_TYPES.contains(file.getContentType())) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_FILE_TYPE", "PNG 또는 JPG 파일만 업로드할 수 있습니다."));
        }
        if (file.getSize() > MAX_AVATAR_BYTES) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("FILE_TOO_LARGE", "파일 용량은 최대 10MB까지 업로드할 수 있습니다."));
        }
        // Content-Type 헤더는 클라이언트가 임의로 지정할 수 있고, ImageIO는 PNG/JPEG 외에
        // GIF/BMP 등도 디코딩할 수 있으므로, ImageReader가 실제로 인식한 포맷이 PNG/JPEG인지까지
        // 확인한다 — /uploads/**는 인증 없이 공개되므로 위장/오분류 파일이 그대로 서빙되는 것을 막는다.
        // 저장 확장자도 이 감지된 포맷을 그대로 쓴다 (Content-Type 헤더를 신뢰하지 않는다).
        if (!avatarDecodeSemaphore.tryAcquire()) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(ApiResponse.fail("TOO_MANY_REQUESTS", "지금 업로드 요청이 몰려 있습니다. 잠시 후 다시 시도해주세요."));
        }
        String detectedFormat;
        try {
            detectedFormat = detectImageFormat(file);
        } catch (AvatarDimensionExceededException e) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("IMAGE_TOO_LARGE", e.getMessage()));
        } finally {
            avatarDecodeSemaphore.release();
        }
        if (detectedFormat == null) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_FILE_TYPE", "PNG 또는 JPG 파일만 업로드할 수 있습니다."));
        }

        Long userId = CurrentUser.id();
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));
        String oldPath = user.getProfileImagePath();

        String newPath;
        try {
            newPath = storeAvatar(user.getId(), file, detectedFormat);
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.fail("UPLOAD_FAILED", "이미지 업로드에 실패했습니다."));
        }

        // 같은 유저가 아바타를 동시에 두 번 업로드하면, 두 요청이 서로 다른 oldPath(둘 다 업로드
        // 전 상태)를 읽어 각자의 새 파일만 알고 있어 나중에 덮어써진 쪽의 파일이 고아로 남는다.
        // 이걸 막으려고 락으로 read-store-save를 직렬화하는 대신, DB의 원자적 UPDATE 하나로
        // "내가 읽었던 oldPath가 그 사이 바뀌지 않았을 때만 반영"하는 compare-and-swap을 쓴다 —
        // 락도, JPA 커넥션과 별개인 추가 커넥션도 필요 없고(커넥션 풀 고갈 위험이 없다),
        // 인스턴스가 몇 개든 Postgres 행 단위 원자성만으로 항상 정확하다.
        int updatedRows;
        try {
            updatedRows = userRepository.updateProfileImagePathIfUnchanged(userId, oldPath, newPath);
        } catch (RuntimeException e) {
            // DB 반영이 실패하면 방금 쓴 새 파일을 되돌린다 — 새 파일은 이전 파일과 이름이 겹치지
            // 않으므로(storeAvatar 참고) 기존 사진은 그대로 남는다. DB 경로와 실제 파일이 어긋나지 않게 한다.
            deleteAvatarFile(userId, newPath);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.fail("UPLOAD_FAILED", "이미지 업로드에 실패했습니다."));
        }

        if (updatedRows == 0) {
            // 그 사이 다른 요청이 먼저 반영됐다 — 내가 방금 쓴 새 파일은 아무도 참조하지 않으므로
            // 지운다. oldPath도 이미 다른 요청이 정리했을 값이라 여기서는 건드리지 않는다.
            deleteAvatarFile(userId, newPath);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.fail("CONCURRENT_UPDATE", "동시에 다른 업로드가 반영되었습니다. 다시 시도해주세요."));
        }

        // DB에 새 경로가 반영된 게 확인된 뒤에만 이전 파일을 지운다.
        if (oldPath != null && !oldPath.equals(newPath)) {
            deleteAvatarFile(userId, oldPath);
        }

        user.setProfileImagePath(newPath);
        return ResponseEntity.ok(ApiResponse.ok(UserSummary.from(user)));
    }

    @Operation(
        summary = "내가 담당한 업무 목록",
        description = "업무 데이터 연동은 회의록/업무 보드 담당 기능에서 채워진다. 현재는 빈 목록을 반환하는 스텁이다."
    )
    @GetMapping("/tasks")
    public ApiResponse<List<Object>> myTasks() {
        return ApiResponse.ok(List.of());
    }

    @Operation(
        summary = "내가 받은/작성한 개인 코멘트",
        description = "코멘트 데이터 연동은 별도 기능 담당에서 채워진다. 현재는 빈 목록을 반환하는 스텁이다."
    )
    @GetMapping("/comments")
    public ApiResponse<List<Object>> myComments() {
        return ApiResponse.ok(List.of());
    }

    /**
     * ImageIO의 ImageReader가 실제로 인식한 포맷 이름이 PNG/JPEG인지 확인하는 것에 더해,
     * 같은 리더로 실제 픽셀 데이터까지 끝까지 디코딩되는지도 확인한다 — 헤더만 보고 포맷을
     * 판별하는 것만으로는 본문이 잘리거나 손상된 파일을 걸러내지 못한다. Content-Type 헤더는
     * 신뢰하지 않는다. 반환값은 저장 시 그대로 확장자로 쓰인다 ("png" 또는 "jpg"), 그 외에는 null.
     * 가로/세로가 MAX_AVATAR_DIMENSION을 넘으면 AvatarDimensionExceededException을 던진다 — 파일 용량은
     * 10MB 이하로 작아도 압축을 풀면 거대한 비트맵이 되는 "압축 폭탄" 이미지로 메모리가 고갈되는
     * 것을 막기 위해, 전체 디코딩(read)을 하기 전에 크기부터 먼저 확인한다. 2000x2000은 스마트폰
     * 카메라 사진 등 일반적인 프로필 사진 해상도를 정상적으로 통과시키면서도, 요청당 디코딩 버퍼를
     * 최대 2000*2000*4바이트(~16MB)로 상한을 두어 고해상도 이미지를 병렬로 밀어넣어 메모리를
     * 고갈시키는 방식의 DoS 여지를 제한한다.
     */
    private String detectImageFormat(MultipartFile file) {
        try (ImageInputStream iis = ImageIO.createImageInputStream(file.getInputStream())) {
            if (iis == null) {
                return null;
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(iis);
            if (!readers.hasNext()) {
                return null;
            }
            ImageReader reader = readers.next();
            try {
                String formatName = reader.getFormatName().toLowerCase();
                String extension;
                if (formatName.equals("png")) {
                    extension = "png";
                } else if (formatName.equals("jpeg") || formatName.equals("jpg")) {
                    extension = "jpg";
                } else {
                    return null;
                }

                reader.setInput(iis);
                if (reader.getWidth(0) > MAX_AVATAR_DIMENSION || reader.getHeight(0) > MAX_AVATAR_DIMENSION) {
                    throw new AvatarDimensionExceededException(
                        "이미지 해상도는 " + MAX_AVATAR_DIMENSION + "x" + MAX_AVATAR_DIMENSION + " 이하여야 합니다."
                    );
                }
                reader.read(0); // 헤더 인식과 별개로 전체 디코딩이 실제로 되는지 확인 (실패 시 IOException)
                return extension;
            } catch (AvatarDimensionExceededException e) {
                // 우리가 의도적으로 던진 해상도 초과 예외만 그대로 전파한다. reader.getWidth/getHeight/read(0)
                // 자체도 손상된 이미지에 대해 IllegalArgumentException을 던질 수 있는데, 그건 여기서
                // 잡지 않고 아래 IOException|RuntimeException 분기로 흘려보내 INVALID_FILE_TYPE으로
                // 처리한다 — 두 원인을 구분하지 않고 전부 해상도 초과로 뭉뚱그리면 손상된 파일에도
                // 부정확한 오류 코드(IMAGE_TOO_LARGE)가 나간다.
                throw e;
            } catch (IOException | RuntimeException e) {
                return null;
            } finally {
                reader.dispose();
            }
        } catch (IOException e) {
            return null;
        }
    }

    private static final class AvatarDimensionExceededException extends RuntimeException {
        AvatarDimensionExceededException(String message) {
            super(message);
        }
    }

    /**
     * 매 업로드마다 고유한 파일명(avatars/{userId}-{nanoTime}.{ext})으로 저장한다 — 같은 이름을
     * 재사용하면 DB 저장이 실패했을 때 되돌리려고 지우는 파일이 방금 막 덮어쓴 "이전" 파일과
     * 같아져 기존 사진까지 유실된다. 고유한 이름을 쓰면 새 파일 쓰기가 기존 파일에 전혀
     * 영향을 주지 않으므로, DB 반영 성공 여부에 따라 새 파일과 이전 파일 중 하나만 안전하게
     * 지우면 된다(호출부 참고). ATOMIC_MOVE는 요구하지 않는다 — 이를 지원하지 않는 파일시스템
     * (일부 컨테이너/네트워크 볼륨)에서는 AtomicMoveNotSupportedException으로 업로드가 항상
     * 실패하는데, 같은 디렉터리 안에서는 REPLACE_EXISTING만으로도 이 용도에 충분하다.
     */
    private String storeAvatar(Long userId, MultipartFile file, String extension) throws IOException {
        Path dir = Path.of(uploadsDir, "avatars").toAbsolutePath().normalize();
        Files.createDirectories(dir);

        String fileName = userId + "-" + System.nanoTime() + "." + extension;
        Path target = dir.resolve(fileName);

        Path tmp = dir.resolve(fileName + ".tmp");
        try {
            file.transferTo(tmp);
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(tmp);
        }

        return "avatars/" + fileName;
    }

    /**
     * DB 반영이 확인된 뒤에만 호출한다. 정리 실패는 무시한다 — orphan 파일만 남을 뿐 서비스에는
     * 영향 없다. relativePath는 항상 storeAvatar()가 만든 값이라 정상적으로는 안전하지만,
     * DB 값이 손상/변조됐을 가능성까지 방어적으로 차단하기 위해 avatars 디렉터리를 벗어나는
     * 경로는 지우지 않는다 (MeetingAnalysisService의 zip-slip 가드와 동일한 패턴). 여기에 더해
     * 파일명이 userId 소유가 맞는지도 확인한다 — storeAvatar가 만드는 파일명은 항상
     * "{userId}-{nanoTime}.{ext}" 형식이므로, 이 조건은 정상 경로에서는 항상 성립한다. 이걸
     * 확인하는 이유는 profile_image_path가 (버그나 DB 직접 조작으로) 다른 유저의 경로를 가리키게
     * 되는 이상 상황이 생기더라도, 그 값을 그대로 믿고 지워서 남의 아바타 파일을 삭제하는 사고를
     * 막기 위해서다.
     */
    private void deleteAvatarFile(Long userId, String relativePath) {
        try {
            Path avatarsDir = Path.of(uploadsDir, "avatars").toAbsolutePath().normalize();
            Path target = Path.of(uploadsDir, relativePath).toAbsolutePath().normalize();
            if (!target.startsWith(avatarsDir)) {
                return;
            }
            if (!target.getFileName().toString().startsWith(userId + "-")) {
                return;
            }
            Files.deleteIfExists(target);
        } catch (IOException ignored) {
        }
    }
}
