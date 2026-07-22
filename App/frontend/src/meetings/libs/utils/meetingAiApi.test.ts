import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../../global/api/apiClient";
import { fetchAttendanceDetail } from "./meetingAiApi";

vi.mock("../../../global/api/apiClient", () => ({
  apiFetch: vi.fn(),
}));

describe("fetchAttendanceDetail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the per-user attendance detail with userId as a query param", async () => {
    vi.mocked(apiFetch).mockResolvedValue([
      { meetingId: "12", title: "12.10 팀 정기 회의", meetingDate: "2026-12-10", attended: true },
      { meetingId: "15", title: "12.11 스프린트 리뷰", meetingDate: "2026-12-11", attended: false },
    ]);

    const result = await fetchAttendanceDetail("1", 2);

    expect(apiFetch).toHaveBeenCalledWith("/projects/1/meetings/attendance-detail?userId=2");
    expect(result).toEqual([
      { meetingId: "12", title: "12.10 팀 정기 회의", meetingDate: "2026-12-10", attended: true },
      { meetingId: "15", title: "12.11 스프린트 리뷰", meetingDate: "2026-12-11", attended: false },
    ]);
  });
});
