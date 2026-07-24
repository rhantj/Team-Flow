package com.workflowai.storage;

import java.io.IOException;
import org.springframework.web.multipart.MultipartFile;

/**
 * 업로드 파일의 실제 저장소를 추상화한다. 지금은 로컬 파일시스템(LocalFileStorageService)만
 * 구현체로 있지만, 호출부(MeController 등)가 이 인터페이스에만 의존하게 해두면 나중에 S3 등
 * Object Storage 구현체로 교체할 때 호출부를 건드리지 않아도 된다. 단일 컨테이너 배포에서는
 * 로컬 볼륨으로 충분하지만, 인스턴스가 여러 대로 늘어나면 인스턴스 간 파일이 공유되지 않으므로
 * 그 시점에 이 인터페이스의 다른 구현체로 교체하는 것을 전제로 분리해둔다.
 */
public interface StorageService {
    /**
     * subdirectory 아래에 fileName으로 file을 저장하고, 업로드 루트 기준 상대 경로
     * ("subdirectory/fileName")를 반환한다.
     */
    String store(String subdirectory, String fileName, MultipartFile file) throws IOException;

    /**
     * 업로드 루트 기준 상대 경로(relativePath)의 파일을 삭제한다. 대상이 subdirectory를
     * 벗어나면(경로 조작 방어) 삭제하지 않고 false를 반환한다. 삭제 자체가 실패해도(권한/IO
     * 오류 등) 예외를 던지지 않고 false를 반환한다 — 호출부는 삭제 성공 여부를 알 수 있을
     * 뿐, 실패했다고 요청 자체를 실패시킬지는 각자 판단한다.
     */
    boolean delete(String subdirectory, String relativePath);
}
