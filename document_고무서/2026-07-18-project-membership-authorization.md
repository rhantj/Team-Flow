# 프로젝트 멤버십 권한 검사 — 진행 상황 (2026-07-18)

## 배경
AI 어시스턴트(RAG) 질의응답에서 다른 사용자의 프로젝트 자료가 근거로 섞일 수 있는지 검토하다가,
`project_id`/`projectId`를 요청 그대로 신뢰하고 프로젝트 멤버십을 검증하지 않는 API가
`RagController` 외에도 여러 곳에 있다는 것을 확인함. JWT 인증(`SecurityConfig`,
`anyRequest().authenticated()`)과 `ProjectAccess` 멤버십 검사 로직 자체는 이미 존재하고
`ProjectController`에서 실제로 쓰이고 있었지만, 아래 컨트롤러들은 아직 적용되지 않은 상태였음.

## 완료된 작업

`ProjectAccess`에 `isMember(String projectIdParam)` 오버로드를 추가함
(`App/backend_spring/src/main/java/com/workflowai/security/ProjectAccess.java`).
프론트가 경로에 그대로 쓰는 `"demo-project"` 같은 문자열을
`DemoDataService.resolveProjectId()`로 실제 `project.id`(Long)로 변환한 뒤 멤버십을 검사한다.

다음 컨트롤러의 모든 엔드포인트에 `@PreAuthorize("@projectAccess.isMember(#projectId)")` 적용:

| 파일 | 엔드포인트 |
|---|---|
| `rag/RagController.java` | `POST /query` |
| `task/TaskController.java` | `GET /`, `POST /`, `PATCH /{taskId}/position`, `PATCH /{taskId}`, `DELETE /{taskId}` |
| `task/ChecklistController.java` | `GET /`, `POST /`, `PATCH /{checklistId}`, `DELETE /{checklistId}` |
| `task/TaskCommentController.java` | `GET /`, `POST /`, `PATCH /{commentId}`, `DELETE /{commentId}` |
| `activity/ActivityController.java` | `GET /` |
| `meeting/MeetingAnalysisController.java` | `POST /analyze`, `GET /`, `GET /{meetingId}`, `GET /{meetingId}/status`, `POST /{meetingId}/retry`, `POST /{meetingId}/tasks/register` |

데모 유저(`1`~`4`)는 `DemoDataService`가 서버 시작 시 데모 프로젝트의 `ProjectMember`로
이미 시딩해두므로, 정상적인 데모 로그인 흐름은 그대로 통과하고 다른 프로젝트 id를
찔러보는 접근만 막힌다. 기존 테스트(`RagControllerTest`, `TaskControllerUpdateTest`,
`MeetingAnalysisControllerTest` 등)는 standalone MockMvc라 시큐리티 필터가 안 걸려서
그대로 통과 확인함(`./gradlew test` 통과, 실패 0건).

## 남은 과제 (아직 미해결)

1. **행위자(actor) 위조 문제** — `TaskCommentController.createComment()`가
   `request.authorId()`를 그대로 신뢰함. 로그인 사용자가 아니라 요청 바디에 적힌 임의
   사용자 명의로 코멘트가 남을 수 있음. `CurrentUser.id()` 기반으로 교체 필요.
2. **활동 로그 행위자 mock 고정** — `TaskController.currentActorId()`,
   `ChecklistController.currentActorId()`가 항상 mock 사용자 `"1"`을 반환.
   실제 로그인 사용자가 활동 로그(`activityService.record(...)`)에 반영되지 않음.
   `CurrentUser.id()`로 교체 필요.
3. **`@PreAuthorize` 자체에 대한 자동 테스트 부재** — 이 레포에는
   `@WithMockUser` + 보안 컨텍스트를 태우는 MockMvc 테스트가 아예 없음
   (`ProjectController`도 마찬가지). "비멤버가 403을 받는지"를 검증하는 테스트가 없어서,
   이번 변경이 실제로 막는지는 수동 확인 또는 통합 테스트 셋업이 필요함.
4. **역할(Role) 기반 세분화 미적용** — 현재는 전부 `isMember`(멤버 여부)만 검사함.
   예: 업무 삭제, 회의록 재분석 등 파괴적 동작을 팀장(LEADER)만 하도록 제한할지는
   별도 정책 결정이 필요함 (`ProjectController`의 `hasRole(#projectId, 'LEADER')` 패턴 참고).
5. **FastAPI 쪽 `project_id` 신뢰 문제** — `llm_rag_assistant/app/routers/chat_router.py`에
   아직 다음 TODO가 남아있음. Spring 레이어에서 멤버십을 막았기 때문에 정상 경로로는
   도달하지 않지만, FastAPI 엔드포인트 자체의 방어는 아니므로 컨테이너 네트워크 구성이
   바뀌면(FastAPI가 외부에 직접 노출되면) 다시 문제가 될 수 있음.
   ```python
   # TODO(FS-1 인증 연동 후): project_id를 요청 그대로 신뢰하지 말고
   # 실제 세션의 프로젝트 멤버십을 검증하도록 교체할 것 (보안 고려사항 #1)
   ```
