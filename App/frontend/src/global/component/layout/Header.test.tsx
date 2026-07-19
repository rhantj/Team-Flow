import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../hooks/useAuth";
import { Header } from "./Header";

vi.mock("../ui/use-mobile", () => ({ useIsMobile: () => true }));

function renderHeader(onOpenMobileMenu = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/board"]}>
      <AuthProvider>
        <Header onOpenMobileMenu={onOpenMobileMenu} />
      </AuthProvider>
    </MemoryRouter>
  );
  return onOpenMobileMenu;
}

describe("Header (mobile)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows a hamburger button on mobile and calls onOpenMobileMenu when clicked", async () => {
    const onOpenMobileMenu = renderHeader();
    const button = screen.getByRole("button", { name: "메뉴 열기" });
    await userEvent.click(button);
    expect(onOpenMobileMenu).toHaveBeenCalledOnce();
  });
});
