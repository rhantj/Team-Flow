import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthProvider } from "../../hooks/useAuth";
import { AppShell } from "./AppShell";

function renderAppShell() {
  return render(
    <MemoryRouter initialEntries={["/board"]}>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the sidebar expanded by default", () => {
    renderAppShell();
    expect(screen.getByText("TeamFlow")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "사이드바 접기" })).toBeInTheDocument();
  });

  it("collapses the sidebar when the toggle is clicked and keeps it collapsed after remount", async () => {
    const { unmount } = renderAppShell();
    await userEvent.click(screen.getByRole("button", { name: "사이드바 접기" }));
    expect(screen.queryByText("TeamFlow")).not.toBeInTheDocument();
    unmount();

    renderAppShell();
    expect(screen.queryByText("TeamFlow")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "사이드바 펼치기" })).toBeInTheDocument();
  });
});
