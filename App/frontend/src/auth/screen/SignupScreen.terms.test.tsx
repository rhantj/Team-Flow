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

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toHaveAttribute("aria-checked", "false");

    await userEvent.click(checkbox);

    expect(checkbox).toHaveAttribute("aria-checked", "false");
  });

  it("약관 보기로 이동해 체크하면 회원가입 화면으로 돌아오고 동의 상태가 켜지며 이름/이메일이 보존된다", async () => {
    renderSignupFlow();

    await userEvent.type(screen.getByPlaceholderText("실명을 입력하세요"), "홍길동");
    await userEvent.type(screen.getByPlaceholderText("name@university.ac.kr"), "hong@example.com");
    await userEvent.type(screen.getByPlaceholderText("8자 이상 입력"), "supersecret1");
    await userEvent.type(screen.getByPlaceholderText("비밀번호를 다시 입력"), "supersecret1");

    await userEvent.click(screen.getByRole("button", { name: "약관 보기" }));

    // 상세 약관 페이지로 이동했다.
    expect(await screen.findByText("이용약관 및 개인정보처리방침")).toBeInTheDocument();

    // 실제 button + role="checkbox"라 키보드로도 접근 가능하다 — 여기서는 클릭으로 검증한다.
    const termsCheckbox = screen.getByRole("checkbox", {
      name: "위 이용약관 및 개인정보처리방침을 모두 확인했으며 이에 동의합니다.",
    });
    await userEvent.click(termsCheckbox);

    // 회원가입 화면으로 돌아왔고, 이름/이메일은 그대로 남아있다.
    const nameInput = await screen.findByPlaceholderText("실명을 입력하세요");
    expect(nameInput).toHaveValue("홍길동");
    expect(screen.getByPlaceholderText("name@university.ac.kr")).toHaveValue("hong@example.com");

    // 비밀번호/비밀번호 확인도 다른 필드와 마찬가지로 보존된다 — router state가 아니라 모듈
    // 스코프 변수(pendingSignupPassword/pendingSignupPasswordConfirm)를 통해 복원되므로
    // 브라우저 히스토리에는 남지 않는다.
    expect(screen.getByPlaceholderText("8자 이상 입력")).toHaveValue("supersecret1");
    expect(screen.getByPlaceholderText("비밀번호를 다시 입력")).toHaveValue("supersecret1");

    // 약관 동의 체크박스가 자동으로 켜졌다.
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });
});
