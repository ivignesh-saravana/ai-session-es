import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hashes the password, POSTs to login, and navigates to /mcqs on success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "1" }), { status: 200 }),
    );
    const { LoginForm } = await import("./login-form");
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/username/i), "ada");
    await user.type(screen.getByLabelText(/password/i), "testpass123");
    await user.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/login");
    const body = JSON.parse(String(init.body));
    expect(body.username).toBe("ada");
    expect(body.passwordHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(body)).not.toContain("testpass123");
    expect(push).toHaveBeenCalledWith("/mcqs");
  });

  it("shows a generic invalid-credentials message on 401 and stays put", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid username or password" }), {
        status: 401,
      }),
    );
    const { LoginForm } = await import("./login-form");
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/username/i), "ada");
    await user.type(screen.getByLabelText(/password/i), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Login" }));

    expect(
      await screen.findByText(/invalid username or password/i),
    ).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});
