import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../global/api/apiClient", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "../../../global/api/apiClient";
import { generateChecklistPreview, applyGeneratedChecklist } from "./checklistApi";

describe("checklistApi AI 함수", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generateChecklistPreview는 generate-preview로 POST한다", async () => {
    (apiFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ titles: ["API 설계"], engine: "ollama" });
    const result = await generateChecklistPreview("task-1", 3);
    expect(apiFetch).toHaveBeenCalledWith("/projects/3/tasks/task-1/checklists/generate-preview", { method: "POST" });
    expect(result.titles).toEqual(["API 설계"]);
    expect(result.engine).toBe("ollama");
  });

  it("applyGeneratedChecklist는 titles를 POST하고 ChecklistItem으로 매핑한다", async () => {
    (apiFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "10", title: "API 설계", done: false }]);
    const result = await applyGeneratedChecklist("task-1", ["API 설계"], 3);
    expect(apiFetch).toHaveBeenCalledWith(
      "/projects/3/tasks/task-1/checklists/apply-generated",
      { method: "POST", body: JSON.stringify({ titles: ["API 설계"] }) }
    );
    expect(result[0]).toEqual({ id: "10", label: "API 설계", done: false });
  });
});
