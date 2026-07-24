import { updateTaskPosition } from "../../../board/libs/utils/taskApi";
import { createTaskComment } from "../../../board/libs/utils/taskCommentApi";
import { fetchChecklist, updateChecklistItem } from "../../../board/libs/utils/checklistApi";
import type { TaskStatus } from "../../../board/libs/types/task";
import type { ActionCard } from "../types/command";

export interface ExecutionResult {
  ok: boolean;
  error?: string;
}

const VALID_STATUSES: TaskStatus[] = ["todo", "inprogress", "blocked", "done"];

// 칸반 position은 드래그앤드롭용 정렬값이다. AI 경로에서는 순서를 지정하지 않으므로
// 목록 끝으로 보내는 큰 값을 쓴다.
const APPEND_POSITION = Date.now();

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

/**
 * 확인 카드를 기존 업무보드 API 호출로 옮긴다.
 *
 * DB를 바꾸는 경로는 여기 하나뿐이고, 전부 화면에서 쓰는 것과 동일한 함수를 부른다.
 * 따라서 권한 검사·활동 로그·알림·RAG 동기화가 자동으로 유지되고, AI 전용 쓰기 경로는 없다.
 */
export async function executeAction(card: ActionCard, projectId: number): Promise<ExecutionResult> {
  if (card.taskId == null) {
    return { ok: false, error: "대상 업무가 지정되지 않았습니다." };
  }
  const taskId = String(card.taskId);

  try {
    switch (card.tool) {
      case "change_status": {
        const to = String(card.args.to ?? "");
        if (!VALID_STATUSES.includes(to as TaskStatus)) {
          return { ok: false, error: "알 수 없는 상태입니다." };
        }
        await updateTaskPosition(taskId, to as TaskStatus, APPEND_POSITION, projectId);
        return { ok: true };
      }
      case "add_comment": {
        const content = String(card.args.content ?? "").trim();
        if (!content) return { ok: false, error: "코멘트 내용이 비어 있습니다." };
        await createTaskComment(taskId, content, projectId);
        return { ok: true };
      }
      case "toggle_checklist": {
        const itemText = String(card.args.item ?? "").trim();
        // 빈 문자열이면 label.includes("")가 항상 참이 되어 첫 항목을 잘못 토글한다.
        if (!itemText) return { ok: false, error: "체크리스트 항목이 지정되지 않았습니다." };
        const done = card.args.done === true;
        const items = await fetchChecklist(taskId, projectId);
        const target = items.find(item => item.label.includes(itemText));
        if (!target) return { ok: false, error: "해당 체크리스트 항목을 찾지 못했습니다." };
        await updateChecklistItem(taskId, target.id, { done }, projectId);
        return { ok: true };
      }
      default:
        // 팀장 전용 도구는 3단계에서 추가한다. 그때까지 카드가 오더라도 실행하지 않는다.
        return { ok: false, error: "아직 지원하지 않는 작업입니다." };
    }
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
