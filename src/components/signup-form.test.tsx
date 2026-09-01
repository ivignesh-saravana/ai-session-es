import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

async function fillValidSignup(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/first name/i), "Ada");
  await user.type(screen.getByLabelText(/last name/i), "Lovelace");
  await user.type(screen.getByLabelText(/^username$/i), "ada@school.edu");
  await user.type(screen.getByLabelText(/^email$/i), "ada@school.edu");
  await user.type(screen.getByLabelText(/^password$/i), "testpass123");
  await user.type(screen.getByLabelText(/confirm password/i), "testpass123");
}

describe("SignupForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the fields needed to register", async () => {
    const { SignupForm } = await import("./signup-form");
    render(<SignupForm />);

    expect(screen.getByLabelText(/first name/i)).toBeTruthy();
    expect(screen.getByLabelText(/last name/i)).toBeTruthy();
    expect(screen.getByLabelText(/^username$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^email$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /create account/i })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /google/i }),
    ).toBeNull();
  });

  it("does not POST when the email is invalid or the password is too short", async () => {
    const { SignupForm } = await import("./signup-form");
    const user = userEvent.setup();
    render(<SignupForm />);

    await user.type(screen.getByLabelText(/first name/i), "Ada");
    await user.type(screen.getByLabelText(/last name/i), "Lovelace");
    await user.type(screen.getByLabelText(/^username$/i), "ada");
    await user.type(screen.getByLabelText(/^email$/i), "not-an-email");
    await user.type(screen.getByLabelText(/^password$/i), "short");
    await user.type(screen.getByLabelText(/confirm password/i), "short");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(fetch).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("hashes the password, POSTs passwordHash, and navigates to /mcqs on success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "1" }), { status: 201 }),
    );
    const { SignupForm } = await import("./signup-form");
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillValidSignup(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/register");
    const body = JSON.parse(String(init.body));
    expect(body.passwordHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(body)).not.toContain("testpass123");
    expect(body.firstName).toBe("Ada");
    expect(body.lastName).toBe("Lovelace");
    expect(body.username).toBe("ada@school.edu");
    expect(body.email).toBe("ada@school.edu");
    expect(push).toHaveBeenCalledWith("/mcqs");
  });

  it("shows an API error and does not navigate", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ error: "username or email already registered" }),
        { status: 409 },
      ),
    );
    const { SignupForm } = await import("./signup-form");
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillValidSignup(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(
      await screen.findByText(/username or email already registered/i),
    ).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});
