from __future__ import annotations

import csv
from datetime import date, datetime, timedelta
from pathlib import Path


SOURCE_TASKS = Path(
    "C:/Users/human-34/Desktop/AI \ud504\ub85c\uc81d\ud2b8/team/work-flow/"
    "\uc124\uacc4 \ubb38\uc11c/ERD/tasks.csv"
)
OUTPUT_DIR = Path(__file__).resolve().parent
CURRENT_DATE = date(2026, 7, 20)
MILESTONES_OUTPUT = "milestones_improved.csv"
TASKS_OUTPUT = "tasks_improved.csv"
CHECKLISTS_OUTPUT = "task_checklists_improved.csv"

MILESTONES = [
    [201, 1, "\uc778\uc99d/\ud504\ub85c\uc81d\ud2b8 \uae30\ubc18 \uad6c\ucd95", "2026-07-22", "2026-07-16 09:00:00"],
    [202, 1, "\ud68c\uc758\ub85d AI\uc640 \uc5c5\ubb34 \uc790\ub3d9\ud654", "2026-07-24", "2026-07-16 09:30:00"],
    [203, 1, "\ubcf4\ub4dc/\ub300\uc2dc\ubcf4\ub4dc \ud504\ub860\ud2b8\uc5d4\ub4dc", "2026-07-27", "2026-07-16 10:00:00"],
    [204, 1, "AI/ML \ubaa8\ub378 \ubc0f RAG \uac80\uc99d", "2026-07-30", "2026-07-16 10:30:00"],
    [205, 1, "\ud1b5\ud569 \ud14c\uc2a4\ud2b8\uc640 QA \uc548\uc815\ud654", "2026-08-03", "2026-07-16 11:00:00"],
    [206, 1, "\ucd5c\uc885 \ubb38\uc11c/\ubc1c\ud45c/\ubc30\ud3ec \uc900\ube44", "2026-08-07", "2026-07-16 11:30:00"],
]
MILESTONE_IDS = {row[2]: row[0] for row in MILESTONES}

CHECKLIST_TITLES = {
    "backend": [
        "API \uc694\uad6c\uc0ac\ud56d \ud655\uc778",
        "\ud575\uc2ec \ub85c\uc9c1 \uad6c\ud604",
        "\uc5f0\ub3d9 \ud14c\uc2a4\ud2b8 \uc218\ud589",
        "\ub9ac\ubdf0 \ubc18\uc601 \ubc0f \ubb38\uc11c\ud654",
    ],
    "frontend": [
        "\ud654\uba74 \ud750\ub984 \uc815\ub9ac",
        "\ucef4\ud3ec\ub10c\ud2b8 \uad6c\ud604",
        "API \uc5f0\ub3d9 \ud655\uc778",
        "\ubc18\uc751\ud615/QA \uc810\uac80",
    ],
    "ai-ml": [
        "\uc785\ub825 \ud53c\ucc98 \ub9e4\ud551 \uac80\ud1a0",
        "\ubaa8\ub378 \uc2e4\ud589 \ubc0f \uacb0\uacfc \ud655\uc778",
        "\uc608\uce21 \uacb0\uacfc API \uc5f0\ub3d9",
        "\uc131\ub2a5/\uc608\uc678 \uc0ac\ub840 \uae30\ub85d",
    ],
    "qa": [
        "\ud14c\uc2a4\ud2b8 \uc2dc\ub098\ub9ac\uc624 \uc815\ub9ac",
        "\uc8fc\uc694 \uae30\ub2a5 \uac80\uc99d",
        "\ubc84\uadf8/\ub9ac\uc2a4\ud06c \uae30\ub85d",
        "\uc7ac\ud14c\uc2a4\ud2b8 \ubc0f \uc644\ub8cc \ud655\uc778",
    ],
    "planning": [
        "\uc5f0\ub3d9 \ub300\uc0c1 \ud14c\uc774\ube14 \ud655\uc778",
        "FK/\uc5c5\ub85c\ub4dc \uc21c\uc11c \uac80\ud1a0",
        "\ub354\ubbf8 \ub370\uc774\ud130 \uac80\uc99d",
        "\uacf5\uc720 \ubc0f \uc2b9\uc778",
    ],
    "other": [
        "\uc791\uc5c5 \ubc94\uc704 \uc815\ub9ac",
        "\ucd08\uc548 \uc791\uc131",
        "\ub9ac\ubdf0 \ubc18\uc601",
        "\uc644\ub8cc \ubcf4\uace0",
    ],
}


def contains_any(text: str, keywords: list[str]) -> bool:
    lowered = text.lower()
    return any(keyword.lower() in lowered for keyword in keywords)


def milestone_id_for_task(task: dict[str, str]) -> int:
    category = (task.get("category") or "").lower()
    source_type = (task.get("source_type") or "").lower()
    title = task.get("title") or ""
    text = " ".join([title, category, source_type])

    if category == "planning":
        return MILESTONE_IDS["\uc778\uc99d/\ud504\ub85c\uc81d\ud2b8 \uae30\ubc18 \uad6c\ucd95"]
    if category == "ai-ml" or contains_any(title, ["AI/ML", "RAG", "\ubaa8\ub378", "\uc608\uce21", "\uc9c0\uc5f0 \uc704\ud5d8", "\uc9c0\uc5f0\uc704\ud5d8"]):
        return MILESTONE_IDS["AI/ML \ubaa8\ub378 \ubc0f RAG \uac80\uc99d"]
    if category == "qa":
        return MILESTONE_IDS["\ud1b5\ud569 \ud14c\uc2a4\ud2b8\uc640 QA \uc548\uc815\ud654"]
    if category == "frontend":
        return MILESTONE_IDS["\ubcf4\ub4dc/\ub300\uc2dc\ubcf4\ub4dc \ud504\ub860\ud2b8\uc5d4\ub4dc"]
    if category == "backend":
        if contains_any(title, ["\uc778\uc99d", "\ub85c\uadf8\uc778", "JWT", "\ud504\ub85c\uc81d\ud2b8", "\uba64\ubc84", "RBAC", "\ub9c8\uc774\ud398\uc774\uc9c0", "/me"]):
            return MILESTONE_IDS["\uc778\uc99d/\ud504\ub85c\uc81d\ud2b8 \uae30\ubc18 \uad6c\ucd95"]
        if contains_any(title, ["\ud68c\uc758\ub85d", "LLM", "\ubd84\uc11d", "To-Do"]):
            return MILESTONE_IDS["\ud68c\uc758\ub85d AI\uc640 \uc5c5\ubb34 \uc790\ub3d9\ud654"]
        if contains_any(title, ["\uacf5\ud1b5", "\ube44\ub3d9\uae30", "\ud3f4\ub9c1", "\uad8c\ud55c/RBAC"]):
            return MILESTONE_IDS["\ud1b5\ud569 \ud14c\uc2a4\ud2b8\uc640 QA \uc548\uc815\ud654"]
        return MILESTONE_IDS["\ud68c\uc758\ub85d AI\uc640 \uc5c5\ubb34 \uc790\ub3d9\ud654"]
    if category == "other":
        if contains_any(title, ["\ud504\ub85c\uc81d\ud2b8", "CRUD", "\ucd08\ub300"]):
            return MILESTONE_IDS["\uc778\uc99d/\ud504\ub85c\uc81d\ud2b8 \uae30\ubc18 \uad6c\ucd95"]
        if contains_any(title, ["To-Do", "Assistant", "LLM", "STT", "\ube44\ub3d9\uae30 \ubd84\uc11d"]):
            return MILESTONE_IDS["\ud68c\uc758\ub85d AI\uc640 \uc5c5\ubb34 \uc790\ub3d9\ud654"]
        if contains_any(title, ["Task", "\uc5c5\ubb34", "\uce74\ud14c\uace0\ub9ac", "\uccb4\ud06c\ub9ac\uc2a4\ud2b8", "activities"]):
            return MILESTONE_IDS["\ubcf4\ub4dc/\ub300\uc2dc\ubcf4\ub4dc \ud504\ub860\ud2b8\uc5d4\ub4dc"]
        if contains_any(title, ["Redis", "\ud1b5\ud569", "\uc778\ud504\ub77c", "API \uacbd\ub85c", "\uc2e4\ud328", "\uc7ac\uc2dc\ub3c4"]):
            return MILESTONE_IDS["\ud1b5\ud569 \ud14c\uc2a4\ud2b8\uc640 QA \uc548\uc815\ud654"]
        if contains_any(title, ["\uc2ec\uc0ac\uc790", "\uae30\uc5ec\ub3c4", "\ucd5c\uc885", "\ub370\ubaa8"]):
            return MILESTONE_IDS["\ucd5c\uc885 \ubb38\uc11c/\ubc1c\ud45c/\ubc30\ud3ec \uc900\ube44"]
    return MILESTONE_IDS["\ucd5c\uc885 \ubb38\uc11c/\ubc1c\ud45c/\ubc30\ud3ec \uc900\ube44"]


def parse_date(value: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def normalize_created_at(value: str) -> str:
    if not value:
        return "2026-07-16 09:00:00"
    try:
        return datetime.fromisoformat(value).replace(microsecond=0).isoformat(sep=" ")
    except ValueError:
        return value[:19]


def effective_due_date(task: dict[str, str]) -> date | None:
    due_date = parse_date(task.get("due_date") or "")
    created_at = parse_date(task.get("created_at") or "")
    if due_date and created_at and due_date < created_at:
        return None
    return due_date


def checklist_done_count(task: dict[str, str]) -> int:
    status = (task.get("status") or "").lower()
    priority = (task.get("priority") or "").lower()
    category = (task.get("category") or "").lower()
    due_date = effective_due_date(task)

    if status == "done":
        return 4
    if status == "blocked":
        return 0
    if status == "inprogress":
        done = 2
        if priority == "high":
            done -= 1
        if category == "ai-ml":
            done += 1
        if due_date and due_date <= CURRENT_DATE:
            done -= 1
        return max(1, min(done, 3))
    if status == "todo":
        if priority == "medium":
            return 1
        if due_date and due_date > CURRENT_DATE + timedelta(days=5):
            return 1
        return 0
    return 0


def write_milestones() -> None:
    with (OUTPUT_DIR / MILESTONES_OUTPUT).open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["id", "project_id", "title", "due_date", "created_at"])
        writer.writerows(MILESTONES)


def write_tasks(tasks: list[dict[str, str]]) -> None:
    if not tasks:
        return

    fieldnames = list(tasks[0].keys())
    if "milestone_id" not in fieldnames:
        fieldnames.insert(2, "milestone_id")

    with (OUTPUT_DIR / TASKS_OUTPUT).open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        for task in tasks:
            output = dict(task)
            output["milestone_id"] = str(milestone_id_for_task(task))
            writer.writerow(output)


def write_checklists(tasks: list[dict[str, str]]) -> None:
    rows: list[list[str | int]] = []
    for task in tasks:
        category = (task.get("category") or "other").lower()
        titles = CHECKLIST_TITLES.get(category, CHECKLIST_TITLES["other"])
        done_count = checklist_done_count(task)
        created_at = normalize_created_at(task.get("created_at") or "")
        for index, title in enumerate(titles, start=1):
            rows.append([
                int(task["id"]),
                title,
                "true" if index <= done_count else "false",
                created_at,
            ])

    with (OUTPUT_DIR / CHECKLISTS_OUTPUT).open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["task_id", "title", "is_done", "created_at"])
        writer.writerows(rows)


def main() -> None:
    with SOURCE_TASKS.open("r", encoding="utf-8-sig", newline="") as file:
        tasks = list(csv.DictReader(file))

    write_milestones()
    write_tasks(tasks)
    write_checklists(tasks)

    print(f"tasks={len(tasks)}")
    print(f"checklist_rows={len(tasks) * 4}")


if __name__ == "__main__":
    main()
