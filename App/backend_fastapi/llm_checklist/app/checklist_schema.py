from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class ChecklistGenerateRequest(BaseModel):
    # 프롬프트 비대화·남용 방지를 위해 경계에서 길이/개수를 제한한다.
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: Optional[str] = Field(default=None, max_length=100)
    priority: Optional[str] = Field(default=None, max_length=50)
    due_date: Optional[str] = Field(default=None, max_length=50)
    existing_items: List[str] = Field(default_factory=list, max_length=100)


class ChecklistItemSuggestion(BaseModel):
    title: str
    reason: str = ""


class ChecklistGenerateResponse(BaseModel):
    items: List[ChecklistItemSuggestion]
    engine: str
