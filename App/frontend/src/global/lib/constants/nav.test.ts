import { describe, expect, it } from "vitest";
import { NAV_ITEMS, TAB_TITLES } from "./nav";

describe("roadmap navigation visibility", () => {
  it("keeps the roadmap title definition while hiding its navigation entry", () => {
    expect(TAB_TITLES.roadmap).toBe("로드맵");
    expect(NAV_ITEMS.some((item) => item.id === "roadmap")).toBe(false);
  });
});
