import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("McqStub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("describes the future question bank and logs out to /login", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const { McqStub } = await import("./mcq-stub");
    const user = userEvent.setup();
    render(<McqStub />);

    expect(
      screen.getByRole("heading", { name: /question bank/i }),
    ).toBeTruthy();
    expect(screen.getByText(/multiple-choice/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/logout",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/login");
  });
});
