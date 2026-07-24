package com.workflowai;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;

/**
 * Spring이 생성자를 고르지 못해 기동 시점에 죽는 것을 빌드 단계에서 잡는다.
 *
 * <p>Spring의 생성자 선택 규칙: 생성자가 하나면 그것을 쓴다. 여러 개면 @Autowired가 붙은
 * 것을 쓰고, 없으면 기본 생성자로 폴백한다. 기본 생성자마저 없으면
 * NoSuchMethodException으로 컨텍스트 초기화가 실패한다.
 *
 * <p>테스트용 생성자 오버로드를 추가할 때 이 조건이 깨지기 쉽다. 단위 테스트는 생성자를
 * 직접 호출하므로 통과하고, 컨테이너 기동 때만 터진다.
 */
class BeanConstructorWiringTest {

    private static final String BASE_PACKAGE = "com.workflowai";

    @Test
    @DisplayName("모든 컴포넌트는 Spring이 주입에 쓸 생성자를 하나로 결정할 수 있어야 한다")
    void everyComponentHasResolvableInjectionConstructor() {
        var scanner = new ClassPathScanningCandidateComponentProvider(true);
        List<String> violations = new ArrayList<>();

        for (var definition : scanner.findCandidateComponents(BASE_PACKAGE)) {
            var className = definition.getBeanClassName();
            if (className == null) {
                continue;
            }

            Class<?> type;
            try {
                type = Class.forName(className);
            } catch (ClassNotFoundException | NoClassDefFoundError e) {
                continue;
            }
            if (type.isInterface() || type.isAnnotation() || type.isEnum()) {
                continue;
            }

            var constructors = type.getDeclaredConstructors();
            if (constructors.length <= 1) {
                continue;
            }

            var annotated = Arrays.stream(constructors)
                .filter(c -> c.isAnnotationPresent(Autowired.class))
                .count();
            var hasNoArg = Arrays.stream(constructors)
                .anyMatch(c -> c.getParameterCount() == 0);

            if (annotated == 1 || (annotated == 0 && hasNoArg)) {
                continue;
            }

            violations.add(
                "%s: 생성자 %d개, @Autowired %d개, 기본 생성자 %s"
                    .formatted(className, constructors.length, annotated, hasNoArg ? "있음" : "없음")
            );
        }

        assertThat(violations)
            .as(
                "생성자가 여러 개인 컴포넌트는 정확히 하나에 @Autowired를 붙여야 한다. "
                    + "위반 시 애플리케이션이 기동에 실패한다."
            )
            .isEmpty();
    }

    @Test
    @DisplayName("MeetingAnalysisQueueWorker는 @Autowired 생성자를 정확히 하나 가진다")
    void meetingAnalysisQueueWorkerHasSingleAutowiredConstructor() {
        var autowired = Arrays.stream(
                com.workflowai.meeting.MeetingAnalysisQueueWorker.class.getDeclaredConstructors()
            )
            .filter(c -> c.isAnnotationPresent(Autowired.class))
            .map(Constructor::getParameterCount)
            .toList();

        assertThat(autowired).containsExactly(4);
    }
}
