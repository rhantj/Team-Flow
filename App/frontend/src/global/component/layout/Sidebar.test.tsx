import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../hooks/useAuth";
import { Sidebar } from "./Sidebar";

function renderSidebar(overrides: Partial<ComponentProps<typeof Sidebar>> = {}) {
  const props: ComponentProps<typeof Sidebar> = {
    active: "board",
    onSelect: () => {},
    onAI: () => {},
    collapsed: false,
    onToggleCollapsed: () => {},
    showCollapseToggle: true,
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Sidebar {...props} />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("Sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows menu labels and logo text when expanded", () => {
    renderSidebar({ collapsed: false });
    expect(screen.getByText("업무 보드")).toBeInTheDocument();
    expect(screen.getByText("TeamFlow")).toBeInTheDocument();
  });

  it("hides menu labels, group headers, and logo text when collapsed", () => {
    renderSidebar({ collapsed: true });
    expect(screen.queryByText("업무 보드")).not.toBeInTheDocument();
    expect(screen.queryByText("계획 관리")).not.toBeInTheDocument();
    expect(screen.queryByText("TeamFlow")).not.toBeInTheDocument();
  });

  it("keeps the active item visually highlighted when collapsed", () => {
    renderSidebar({ collapsed: true, active: "board" });
    const boardButton = screen.getByRole("button", { name: "업무 보드" });
    expect(boardButton).toHaveStyle({ background: "var(--sidebar-primary)" });
  });

  it("still exposes an accessible name for icon-only buttons when collapsed", () => {
    renderSidebar({ collapsed: true });
    expect(screen.getByRole("button", { name: "업무 보드" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "대시보드" })).toBeInTheDocument();
  });

  it("shows a tooltip with the item label when a collapsed icon is hovered", async () => {
    renderSidebar({ collapsed: true });
    const boardButton = screen.getByRole("button", { name: "업무 보드" });
    await userEvent.hover(boardButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("업무 보드");
  });

  it("calls onToggleCollapsed when the toggle button is clicked", async () => {
    const onToggleCollapsed = vi.fn();
    renderSidebar({ onToggleCollapsed, collapsed: false });
    await userEvent.click(screen.getByRole("button", { name: "사이드바 접기" }));
    expect(onToggleCollapsed).toHaveBeenCalledOnce();
  });

  it("labels the toggle button for expanding when already collapsed", () => {
    renderSidebar({ collapsed: true });
    expect(screen.getByRole("button", { name: "사이드바 펼치기" })).toBeInTheDocument();
  });

  it("hides the toggle button entirely when showCollapseToggle is false", () => {
    renderSidebar({ showCollapseToggle: false });
    expect(screen.queryByRole("button", { name: "사이드바 접기" })).not.toBeInTheDocument();
  });

  it("applies the dark scrollbar styling to the nav element", () => {
    renderSidebar();
    const nav = screen.getByRole("navigation");
    expect(nav).toHaveClass("scrollbar-thin-dark");
  });
});
