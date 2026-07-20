# [팀 공유] `@WebMvcTest` 슬라이스 테스트 전체 깨짐 — 공유 인프라 이슈

작성일: 2026-07-20
작성자: 이은주 (FS-5, FS-09 진행 중 발견)

## 요약

`App/backend_spring`에서 `@WebMvcTest`를 쓰는 테스트가 **전부** 실패한다. 코드베이스에
`@WebMvcTest`를 쓰는 테스트가 2개 있는데 둘 다 깨져 있다:

- `ContributionReportSecurityTest` — 1/1 실패
- `TaskControllerUpdateTest` — 4/4 실패

FS-09 기여도 점수 Spring 연동 작업 중 새 `@WebMvcTest` 기반 보안 테스트를 추가하려다 발견함.
저희 작업(`contribution_score`) 때문에 생긴 문제가 아니라 이미 있던 문제라, 이번 작업
스코프에서는 손대지 않고 별도로 공유한다.

## 근본 원인 (실측 확인함)

`WorkFlowAiBackendApplication.java`:

```java
@SpringBootApplication
@ConfigurationPropertiesScan
@ComponentScan(basePackages = {"com.workflowai", "dashboard"})
@EntityScan(basePackages = {"com.workflowai", "dashboard"})
@EnableJpaRepositories(basePackages = {"com.workflowai", "dashboard"})
public class WorkFlowAiBackendApplication { ... }
```

`dashboard` 패키지가 `com.workflowai`의 하위 패키지가 아니라 형제 패키지라서, 기본 스캔
범위에 안 들어오는 걸 해결하려고 메인 클래스에 `@ComponentScan`/`@EntityScan`/
`@EnableJpaRepositories`를 명시적으로 넓혀놓은 상태다(코드 주석에 이유가 적혀 있음).

문제는 `@EnableJpaRepositories`를 이렇게 **메인 클래스에 명시적으로** 선언하면,
Spring Boot의 자동설정(auto-configuration) 방식과 달리 `@WebMvcTest` 슬라이스가 이걸
제외할 방법이 없다는 것. `@WebMvcTest`의 컨텍스트 격리(테스트 대상 컨트롤러 하나만 빈으로
등록)가 무력화되면서, 앱에 있는 다른 컨트롤러들까지 전부 빈 그래프에 끌려들어온다 —
그 컨트롤러들의 JPA 리포지토리 의존성 때문에 `entityManagerFactory`가 필요한데,
`@WebMvcTest`는 원래 JPA를 설정하지 않으므로 컨텍스트 로딩 자체가 실패한다.

**직접 재현/검증한 내용**: `ContributionReportSecurityTest`(`@WebMvcTest
(ContributionReportController.class)`)를 실행하면 `ActivityController` → `ActivityRepository`
→ `entityManagerFactory` 못 찾음으로 실패한다. `ActivityController`가 필요로 하는
리포지토리 3개(`ActivityRepository`/`TaskRepository`/`UserRepository`)를 `@MockBean`으로
채워서 회피를 시도해봤는데, 이번엔 완전히 무관한 `AuthController`(구글 OAuth,
`GoogleOAuthService`→`GoogleOAuthProperties`)가 또 끌려들어와서 다른 이유로 실패했다 —
즉 컨트롤러 하나둘을 mock해서 해결될 문제가 아니라, **앱 전체 컨트롤러 그래프가
연쇄적으로 딸려 들어오는 구조적 문제**다.

## 영향 범위

- 이미 있는 `@WebMvcTest` 테스트 2개 전부 (위 목록)
- 앞으로 누구든 `@WebMvcTest`로 새 테스트를 작성하면 똑같이 깨짐 (저도 FS-09 REVIEWER 권한
  테스트를 이 방식으로 만들려다 못 만들고 스코프에서 뺐음 — `document_이은주/superpowers/plans/2026-07-20-contribution-score-spring-integration.md`의 Task 2)
- 컨트롤러 단위 테스트를 standalone `MockMvc`(Mockito만 사용, Spring 컨텍스트 안 띄움)로
  짜는 패턴은 영향 없음 — `ContributionReportControllerTest`/`ContributionScoreControllerTest`
  같은 것들은 정상 동작.

## 제안하는 수정 방향 (진짜 원인 해결, 이번 작업 스코프 밖)

`dashboard` 패키지를 `com.workflowai.dashboard`로 옮겨서(진짜 하위 패키지로 만들어서)
메인 클래스의 명시적 `@ComponentScan`/`@EntityScan`/`@EnableJpaRepositories`를 전부
제거하고 Spring Boot 기본 자동설정에 맡기는 게 정석적인 해결책으로 보인다. 다만
`dashboard` 패키지 전체 리네이밍이라 대시보드 담당(FS-3)과 상의가 필요하고, 이번 FS-09
작업 범위를 크게 벗어나서 직접 고치지 않았다.

## 임시로 참고할 것

`@WebMvcTest` 대신 standalone `MockMvc`(순수 Mockito, `MockMvcBuilders.standaloneSetup
(controller).build()`) 방식으로 컨트롤러 단위 테스트를 짜면 이 문제를 안 만난다 — 단,
이 방식은 `@PreAuthorize` 같은 메서드 시큐리티가 실제로 동작하는지는 검증 못 한다
(AOP 프록시가 Spring 컨텍스트에 의존하기 때문). 권한 검증 자동 테스트가 필요하면 이
이슈부터 해결해야 한다.
