import { beforeEach, describe, expect, it, vi } from "vitest";

const { createUser, getCredentialsByUsername } = vi.hoisted(() => ({
  createUser: vi.fn(),
  getCredentialsByUsername: vi.fn(),
}));

vi.mock("@/lib/services/user-service", () => ({
  createUser,
  getCredentialsByUsername,
}));

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and does not write user records", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/auth/logout", { method: "POST" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(createUser).not.toHaveBeenCalled();
    expect(getCredentialsByUsername).not.toHaveBeenCalled();
  });
});
