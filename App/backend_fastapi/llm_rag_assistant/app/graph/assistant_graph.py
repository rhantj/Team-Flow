from __future__ import annotations

import asyncio
import logging
import uuid

from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt
from pydantic import BaseModel

from core.config import get_settings
from llm_rag_assistant.app.graph.planner import plan_actions
from llm_rag_assistant.app.graph.state import (
    SUPPORTED_TOOLS,
    Action,
    CommandState,
    requires_leader,
)
from llm_rag_assistant.app.graph.task_resolver import resolve_task_ref

logger = logging.getLogger(__name__)

_LEADER_ONLY_MESSAGE = "이 작업은 팀장 권한이 필요합니다. 팀장님께 요청해주세요."
_NOT_UNDERSTOOD_MESSAGE = "무엇을 변경해야 할지 이해하지 못했습니다. 대상 업무와 원하는 변경을 함께 말씀해주세요."
_TASK_NOT_FOUND_MESSAGE = "말씀하신 업무를 찾지 못했습니다."
_THREAD_EXPIRED_MESSAGE = "요청이 만료되었습니다. 다시 말씀해주세요."
_UNSUPPORTED_TOOL_MESSAGE = "아직 지원하지 않는 작업입니다."
_STEP_MISMATCH_MESSAGE = "이미 처리되었거나 일치하지 않는 요청입니다. 다시 말씀해주세요."

_TOOL_LABELS = {
    "change_status": "업무 상태 변경",
    "add_comment": "코멘트 추가",
    "toggle_checklist": "체크리스트 변경",
    "rename_task": "업무 이름 변경",
    "set_due_date": "마감일 지정",
    "change_assignee": "담당자 변경",
    "delete_task": "업무 삭제",
}

_STATUS_LABELS = {"todo": "할 일", "inprogress": "진행중", "blocked": "보류", "done": "완료"}


class ActionCardPayload(BaseModel):
    step_id: str
    tool: str
    task_id: int | None
    title: str
    summary: str
    args: dict


class GraphOutcome(BaseModel):
    type: str  # "confirm" | "done"
    message: str
    card: ActionCardPayload | None = None
    thread_id: str | None = None


def _summarize(action: Action, task_title: str) -> str:
    if action.tool == "change_status":
        to = _STATUS_LABELS.get(str(action.args.get("to")), str(action.args.get("to")))
        return f"{task_title} → {to}"
    if action.tool == "add_comment":
        return f'{task_title}에 "{action.args.get("content", "")}" 코멘트를 남깁니다'
    if action.tool == "toggle_checklist":
        state = "완료" if action.args.get("done") else "미완료"
        return f'{task_title}의 "{action.args.get("item", "")}" 항목을 {state}로 표시합니다'
    if action.tool == "set_due_date":
        return f"{task_title}의 마감일을 {action.args.get('date', '')}로 지정합니다"
    if action.tool == "rename_task":
        return f"{task_title} → \"{action.args.get('title', '')}\""
    if action.tool == "change_assignee":
        return f"{task_title}의 담당자를 {action.args.get('assignee_name', '')}(으)로 변경합니다"
    if action.tool == "delete_task":
        return f"{task_title}을(를) 삭제합니다"
    return task_title


# 그래프는 pool을 상태에 넣지 않는다(직렬화 불가). 노드가 참조할 수 있도록 모듈 수준에 둔다.
# 요청마다 덮어쓰지만 pool 객체 자체는 앱 수명 동안 동일하므로 경합 문제가 없다.
_pool_holder: dict[str, object] = {}


async def _plan_node(state: CommandState) -> dict:
    actions = await plan_actions(state["question"], state.get("history", []))
    if not actions:
        return {"plan": [], "final_message": _NOT_UNDERSTOOD_MESSAGE}
    return {"plan": [a.model_dump() for a in actions], "cursor": 0, "results": []}


async def _prepare_node(state: CommandState) -> dict:
    plan = state.get("plan", [])
    cursor = state.get("cursor", 0)
    if cursor >= len(plan):
        return {}

    action = Action.model_validate(plan[cursor])

    # 1차 권한 방어. 최종 방어선은 Spring @PreAuthorize이며, 여기서 막는 이유는
    # 누르면 반드시 실패할 버튼을 사용자에게 보여주지 않기 위해서다.
    if requires_leader(action.tool) and state.get("user_role") != "LEADER":
        return {"plan": [], "final_message": _LEADER_ONLY_MESSAGE}

    # 실행기가 아직 수행할 수 없는 도구는 확인 카드를 만들지 않는다. 카드를 띄우면 사용자가
    # 실행을 눌러도 프론트가 거부해 "카드는 떴는데 안 되는" 계약 불일치가 된다.
    if action.tool not in SUPPORTED_TOOLS:
        return {"plan": [], "final_message": _UNSUPPORTED_TOOL_MESSAGE}

    match = await resolve_task_ref(_pool_holder.get("pool"), state["project_id"], action.task_ref)
    if match.task_id is None:
        if match.candidates:
            options = ", ".join(f"{c.title}(#{c.task_id})" for c in match.candidates)
            return {"plan": [], "final_message": f"어떤 업무인가요? {options}"}
        return {"plan": [], "final_message": _TASK_NOT_FOUND_MESSAGE}

    prepared = dict(plan[cursor])
    prepared["_task_id"] = match.task_id
    prepared["_task_title"] = match.title
    new_plan = list(plan)
    new_plan[cursor] = prepared
    return {"plan": new_plan}


async def _execute_node(state: CommandState) -> dict:
    plan = state.get("plan", [])
    cursor = state.get("cursor", 0)
    entry = plan[cursor]
    action = Action.model_validate({k: v for k, v in entry.items() if not k.startswith("_")})

    # 여기서 멈춘다. 실제 쓰기는 프론트가 기존 Spring API를 자기 JWT로 호출해 수행하고,
    # 그 결과가 Command(resume=...)로 되돌아온다. FastAPI는 쓰기 API를 직접 부르지 않는다.
    result = interrupt(
        {
            "step_id": f"{cursor}-{uuid.uuid4().hex[:8]}",
            "tool": action.tool,
            "task_id": entry.get("_task_id"),
            "title": _TOOL_LABELS.get(action.tool, action.tool),
            "summary": _summarize(action, entry.get("_task_title", "")),
            "args": action.args,
        }
    )

    results = list(state.get("results", []))
    results.append(result)
    if not result.get("ok"):
        reason = result.get("error") or "알 수 없는 오류"
        return {
            "results": results,
            "plan": [],
            "final_message": f"작업을 완료하지 못했습니다: {reason}",
        }
    return {"results": results, "cursor": cursor + 1}


async def _finish_node(state: CommandState) -> dict:
    if state.get("final_message"):
        return {}
    done = len([r for r in state.get("results", []) if r.get("ok")])
    return {"final_message": f"{done}개 작업을 완료했습니다."}


def _route_after_prepare(state: CommandState) -> str:
    plan = state.get("plan", [])
    if not plan or state.get("cursor", 0) >= len(plan):
        return "finish"
    return "execute"


def _route_after_plan(state: CommandState) -> str:
    return "finish" if not state.get("plan") else "prepare"


def _build() -> StateGraph:
    builder = StateGraph(CommandState)
    builder.add_node("plan", _plan_node)
    builder.add_node("prepare", _prepare_node)
    builder.add_node("execute", _execute_node)
    builder.add_node("finish", _finish_node)

    builder.add_edge(START, "plan")
    builder.add_conditional_edges("plan", _route_after_plan, ["prepare", "finish"])
    builder.add_conditional_edges("prepare", _route_after_prepare, ["execute", "finish"])
    builder.add_edge("execute", "prepare")
    builder.add_edge("finish", END)
    return builder


# 체크포인트는 승인 대기 중인 임시 상태다. 내구성이 필요 없고 TTL이 필요해 Redis를 쓴다
# (유실되면 "요청이 만료되었습니다"로 안내하고 사용자가 다시 말하면 된다).
_CHECKPOINT_TTL_MINUTES = 30

_compiled = None
_checkpointer_cm = None
# 최초 동시 요청이 각자 체크포인터를 만들어 Redis 연결이 새는 것을 막는다(이중 검사 잠금).
_graph_lock = asyncio.Lock()


async def get_graph():
    """그래프를 지연 생성한다. Redis 연결이 앱 기동을 막지 않도록 첫 요청에서 만든다."""
    global _compiled, _checkpointer_cm
    if _compiled is not None:
        return _compiled
    async with _graph_lock:
        # 잠금 대기 중 다른 요청이 이미 만들었을 수 있으므로 다시 확인한다.
        if _compiled is not None:
            return _compiled
        settings = get_settings()
        checkpointer_cm = AsyncRedisSaver.from_conn_string(
            settings.redis_url,
            ttl={"default_ttl": _CHECKPOINT_TTL_MINUTES, "refresh_on_read": False},
        )
        checkpointer = await checkpointer_cm.__aenter__()
        await checkpointer.asetup()
        _checkpointer_cm = checkpointer_cm
        _compiled = _build().compile(checkpointer=checkpointer)
    return _compiled


async def close_graph() -> None:
    """앱 종료 시 체크포인터가 잡고 있는 Redis 연결을 닫는다(자원 누수 방지)."""
    global _compiled, _checkpointer_cm
    async with _graph_lock:
        if _checkpointer_cm is not None:
            try:
                await _checkpointer_cm.__aexit__(None, None, None)
            except Exception:
                logger.warning("체크포인터 종료 실패", exc_info=True)
        _checkpointer_cm = None
        _compiled = None


def _to_outcome(result: dict, thread_id: str) -> GraphOutcome:
    interrupts = result.get("__interrupt__")
    if interrupts:
        payload = interrupts[0].value
        return GraphOutcome(
            type="confirm",
            message="아래 작업을 실행할까요?",
            card=ActionCardPayload(**payload),
            thread_id=thread_id,
        )
    return GraphOutcome(
        type="done",
        message=result.get("final_message") or "처리를 마쳤습니다.",
        thread_id=thread_id,
    )


async def start_command(pool, state: dict) -> GraphOutcome:
    _pool_holder["pool"] = pool
    graph = await get_graph()
    thread_id = uuid.uuid4().hex
    config = {"configurable": {"thread_id": thread_id}}
    result = await graph.ainvoke(state, config=config)
    return _to_outcome(result, thread_id)


def _pending_step_id(snapshot) -> str | None:
    """대기 중인 interrupt에 실린 step_id를 꺼낸다. 없으면 None."""
    for task in getattr(snapshot, "tasks", ()) or ():
        for interrupt_obj in getattr(task, "interrupts", ()) or ():
            value = getattr(interrupt_obj, "value", None)
            if isinstance(value, dict) and value.get("step_id"):
                return value["step_id"]
    return None


async def resume_command(thread_id: str, execution_result: dict) -> GraphOutcome:
    graph = await get_graph()
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = await graph.aget_state(config)
    if not snapshot or not snapshot.next:
        return GraphOutcome(type="done", message=_THREAD_EXPIRED_MESSAGE, thread_id=thread_id)

    # 넘어온 실행 결과가 지금 대기 중인 바로 그 단계의 것인지 확인한다. step_id가 다르거나
    # 대기 단계를 특정하지 못하면(fail-closed) 잘못됐거나 재전송된 결과이므로 진행시키지 않는다.
    # 이 그래프의 유일한 정지점은 step_id를 실은 interrupt라 정상 상황에서 expected는 항상 있다.
    expected = _pending_step_id(snapshot)
    if expected is None or execution_result.get("step_id") != expected:
        return GraphOutcome(type="done", message=_STEP_MISMATCH_MESSAGE, thread_id=thread_id)

    result = await graph.ainvoke(Command(resume=execution_result), config=config)
    return _to_outcome(result, thread_id)
