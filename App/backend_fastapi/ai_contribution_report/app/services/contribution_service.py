from __future__ import annotations

import asyncio

from ollama import AsyncClient

from ai_contribution_report.app.schema.contribution_schema import MemberContribution
from ai_contribution_report.app.services import contribution_db as db
from core.config import get_settings

_SUMMARY_SYSTEM_PROMPT = (
    "당신은 WorkFlow AI 프로젝트의 기여도 평가 보조자입니다. "
    "주어진 근거 데이터만 사용해 2~3문장으로 한국어 요약을 작성하고, "
    "근거에 없는 내용은 추측하지 마세요."
)


def build_evidence(row: dict, workload: dict | None = None) -> list[str]:
    evidence = [f"To-Do {row['todo_done']}/{row['todo_total']}건 완료"]
    if row["meetings_total"] > 0:
        rate = round(row["meetings_attended"] / row["meetings_total"] * 100)
        evidence.append(f"회의 {row['meetings_attended']}/{row['meetings_total']}회 참석 (참석률 {rate}%)")
    else:
        evidence.append("등록된 회의 없음")
    if workload is not None:
        # overload_score는 팀 내 상대 점수이므로 프로젝트 간 비교 문구는 넣지 않는다.
        evidence.append(f"업무 편중 점수 {workload['overload_score']}점 ({workload['anomaly_type']})")
    return evidence


async def generate_summary(row: dict, evidence: list[str]) -> str:
    settings = get_settings()
    client = AsyncClient(host=settings.ollama_host)
    evidence_text = "\n".join(f"- {item}" for item in evidence)
    response = await client.chat(
        model=settings.generation_model,
        messages=[
            {"role": "system", "content": _SUMMARY_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"팀원 이름: {row['name']}\n활동 근거:\n{evidence_text}\n\n"
                "위 근거를 바탕으로 이 팀원의 기여도를 2~3문장 한국어로 요약해줘.",
            },
        ],
    )
    return response["message"]["content"]


async def generate_contribution_reports(project_id: int) -> list[MemberContribution]:
    rows = await asyncio.to_thread(db.load_contribution_inputs, project_id)
    if not rows:
        return []

    workload_scores = await asyncio.to_thread(db.load_workload_scores, project_id)

    results: list[MemberContribution] = []
    for row in rows:
        evidence = build_evidence(row, workload_scores.get(row["user_id"]))
        summary = await generate_summary(row, evidence)
        results.append(MemberContribution(user_id=row["user_id"], name=row["name"], summary=summary, evidence=evidence))

    await asyncio.to_thread(
        db.save_contribution_reports,
        project_id,
        [{"user_id": r.user_id, "summary": r.summary, "evidence": r.evidence} for r in results],
    )
    return results
