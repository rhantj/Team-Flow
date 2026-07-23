import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { SignupScreen } from "./SignupScreen";
import { SignupTermsScreen } from "./SignupTermsScreen";

vi.mock("../../global/hooks/useAuth", () => ({
  useAuth: () => ({
    loginWithGoogle: vi.fn(),
    refreshMe: vi.fn(),
  }),
}));

function renderSignupFlow() {
  return render(
    <MemoryRouter initialEntries={["/signup"]}>
      <Routes>
        <Route path="/signup" element={<SignupScreen />} />
        <Route path="/signup/terms" element={<SignupTermsScreen />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("회원가입 약관 동의 체크박스", () => {
  it("체크박스를 직접 클릭해도 체크되지 않는다", async () => {
    renderSignupFlow();

    const checkbox = screen.getByTitle("약관 보기를 통해 확인 후 자동으로 체크됩니다");
    expect(checkbox.className).not.toContain("bg-blue-500");

    await userEvent.click(checkbox);

    expect(checkbox.className).not.toContain("bg-blue-500");
  });

  it("약관 보기로 이동해 체크하면 회원가입 화면으로 돌아오고 동의 상태가 켜지며 입력값이 보존된다", async () => {
    renderSignupFlow();

    await userEvent.type(screen.getByPlaceholderText("실명을 입력하세요"), "홍길동");
    await userEvent.type(screen.getByPlaceholderText("name@university.ac.kr"), "hong@example.com");

    await userEvent.click(screen.getByRole("button", { name: "약관 보기" }));

    // 상세 약관 페이지로 이동했다.
    expect(await screen.findByText("이용약관 및 개인정보처리방침")).toBeInTheDocument();

    const agreeText = screen.getByText(
      "위 이용약관 및 개인정보처리방침을 모두 확인했으며 이에 동의합니다."
    );
    const termsCheckbox = agreeText.closest("label")?.querySelector("div[class*='cursor-pointer']");
    expect(termsCheckbox).toBeTruthy();
    await userEvent.click(termsCheckbox as Element);

    // 회원가입 화면으로 돌아왔고, 입력하던 값이 그대로 남아있다.
    const nameInput = await screen.findByPlaceholderText("실명을 입력하세요");
    expect(nameInput).toHaveValue("홍길동");
    expect(screen.getByPlaceholderText("name@university.ac.kr")).toHaveValue("hong@example.com");

    // 약관 동의 체크박스가 자동으로 켜졌다.
    const restoredCheckbox = screen.getByTitle("약관 보기를 통해 확인 후 자동으로 체크됩니다");
    expect(restoredCheckbox.className).toContain("bg-blue-500");
  });
});
