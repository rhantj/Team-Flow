package com.workflowai.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * uploads 루트 디렉터리(workflow.uploads.dir) 아래 로컬 파일시스템에 저장/삭제하는 기본
 * 구현체. 컨테이너 재시작 시에도 볼륨이 유지되는 단일 인스턴스 배포를 전제로 한다 — 인스턴스가
 * 여러 대가 되면 인스턴스 간 파일이 공유되지 않으므로, 그 시점에는 StorageService의 다른
 * 구현체(S3 등)로 교체할 것.
 */
@Service
public class LocalFileStorageService implements StorageService {
    private static final Logger log = LoggerFactory.getLogger(LocalFileStorageService.class);

    private final String rootDir;

    public LocalFileStorageService(@Value("${workflow.uploads.dir}") String rootDir) {
        this.rootDir = rootDir;
    }

    @Override
    public String store(String subdirectory, String fileName, MultipartFile file) throws IOException {
        Path dir = Path.of(rootDir, subdirectory).toAbsolutePath().normalize();
        Files.createDirectories(dir);

        Path target = dir.resolve(fileName);
        Path tmp = dir.resolve(fileName + ".tmp");
        try {
            file.transferTo(tmp);
            // ATOMIC_MOVE는 요구하지 않는다 — 이를 지원하지 않는 파일시스템(일부 컨테이너/네트워크
            // 볼륨)에서는 AtomicMoveNotSupportedException으로 업로드가 항상 실패하는데, 같은
            // 디렉터리 안에서는 REPLACE_EXISTING만으로도 이 용도에 충분하다.
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(tmp);
        }

        return subdirectory + "/" + fileName;
    }

    @Override
    public boolean delete(String subdirectory, String relativePath) {
        try {
            Path dir = Path.of(rootDir, subdirectory).toAbsolutePath().normalize();
            Path target = Path.of(rootDir, relativePath).toAbsolutePath().normalize();
            // DB 값이 손상/변조됐을 가능성까지 방어적으로 차단한다 — subdirectory를 벗어나는
            // 경로는 지우지 않는다(zip-slip류 경로 조작 방어와 동일한 패턴).
            if (!target.startsWith(dir)) {
                log.warn("파일 삭제 거부: 경로가 {} 디렉터리를 벗어남 ({})", subdirectory, relativePath);
                return false;
            }
            return Files.deleteIfExists(target);
        } catch (IOException e) {
            log.warn("파일 삭제 실패: path={}", relativePath, e);
            return false;
        }
    }
}
