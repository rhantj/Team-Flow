package com.workflowai.storage;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.multipart.MultipartFile;

@ExtendWith(MockitoExtension.class)
class LocalFileStorageServiceTest {

    @TempDir
    Path uploadsDir;

    @Mock
    private MultipartFile file;

    private LocalFileStorageService storageService(Path root) {
        return new LocalFileStorageService(root.toString());
    }

    @Test
    void store_writesFileUnderSubdirectoryAndReturnsRelativePath() throws Exception {
        LocalFileStorageService service = storageService(uploadsDir);
        byte[] content = "png-bytes".getBytes();
        doAnswerTransferTo(content);

        String relativePath = service.store("avatars", "1-abc.png", file);

        assertThat(relativePath).isEqualTo("avatars/1-abc.png");
        assertThat(Files.readAllBytes(uploadsDir.resolve(relativePath))).isEqualTo(content);
    }

    @Test
    void delete_removesFileWithinSubdirectory() throws Exception {
        LocalFileStorageService service = storageService(uploadsDir);
        Path avatarsDir = Files.createDirectories(uploadsDir.resolve("avatars"));
        Path target = avatarsDir.resolve("1-abc.png");
        Files.writeString(target, "content");

        boolean deleted = service.delete("avatars", "avatars/1-abc.png");

        assertThat(deleted).isTrue();
        assertThat(Files.exists(target)).isFalse();
    }

    @Test
    void delete_rejectsPathEscapingSubdirectory() throws Exception {
        LocalFileStorageService service = storageService(uploadsDir);
        Path outsideFile = Files.writeString(uploadsDir.resolve("secret.txt"), "top secret");

        boolean deleted = service.delete("avatars", "../secret.txt");

        assertThat(deleted).isFalse();
        assertThat(Files.exists(outsideFile)).isTrue();
    }

    @Test
    void delete_returnsFalseInsteadOfThrowing_whenRelativePathIsNotAValidPath() {
        LocalFileStorageService service = storageService(uploadsDir);
        // 실제 파일시스템이 허용하지 않는 문자(NUL, 코드 포인트 0)가 섞인 경로 — DB 값 손상/변조를
        // 흉내낸다. Path.of()가 InvalidPathException(unchecked)을 던지는데, 이걸 잡지 못하면
        // 호출부까지 예외가 전파된다.
        char nulChar = (char) 0;
        String malformedPath = "avatars/1-bad" + nulChar + "name.png";

        boolean deleted = service.delete("avatars", malformedPath);

        assertThat(deleted).isFalse();
    }

    private void doAnswerTransferTo(byte[] content) throws Exception {
        org.mockito.Mockito.doAnswer(invocation -> {
            Path dest = invocation.getArgument(0);
            Files.write(dest, content);
            return null;
        }).when(file).transferTo(org.mockito.ArgumentMatchers.any(Path.class));
    }
}
