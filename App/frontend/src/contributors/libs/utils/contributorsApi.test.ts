import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../../global/api/apiClient";
import { fetchContributionReport } from "./contributorsApi";

vi.mock("../../../global/api/apiClient", () => ({
  apiFetch: vi.fn(),
}));

describe("fetchContributionReport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("converts snake_case response to camelCase", async () => {
    vi.mocked(apiFetch).mockResolvedValue([
      { user_id: 1, name: "김민준", summary: "요약입니다", evidence: ["To-Do 8/10건 완료"] },
    ]);

    const result = await fetchContributionReport(1);

    expect(apiFetch).toHaveBeenCalledWith("/ai/contribution/report", {
      method: "POST",
      body: JSON.stringify({ project_id: 1 }),
    });
    expect(result).toEqual([
      { userId: 1, name: "김민준", summary: "요약입니다", evidence: ["To-Do 8/10건 완료"] },
    ]);
  });
});
