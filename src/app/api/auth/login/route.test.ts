import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCredentialsByUsername } = vi.hoisted(() => ({
  getCredentialsByUsername: vi.fn(),
}));

vi.mock("@/lib/services/user-service", () => ({
  getCredentialsByUsername,
}));

function post(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const passwordHash = "b".repeat(64);
const publicUser = {
  id: "user1",
  firstName: "Ada",
  lastName: "Lovelace",
  username: "ada",
  email: "ada@school.edu",
  createdAt: "2026-01-01 00:00:00",
  updatedAt: "2026-01-01 00:00:00",
};

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and the public user when credentials match", async () => {
    getCredentialsByUsername.mockResolvedValue({
      user: publicUser,
      passwordHash,
    });
    const { POST } = await import("./route");
    const response = await POST(
      post({ username: "ada", passwordHash }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(getCredentialsByUsername).toHaveBeenCalledWith("ada");
    expect(json).toEqual(publicUser);
    expect(json).not.toHaveProperty("passwordHash");
    expect(json).not.toHaveProperty("password_hash");
  });

  it("returns 400 when username or passwordHash is missing", async () => {
    const { POST } = await import("./route");
    const missingUsername = await POST(post({ passwordHash }));
    const missingHash = await POST(post({ username: "ada" }));

    expect(missingUsername.status).toBe(400);
    expect(missingHash.status).toBe(400);
    expect(await missingUsername.json()).toEqual({ error: expect.any(String) });
    expect(getCredentialsByUsername).not.toHaveBeenCalled();
  });

  it("returns 401 with the same message for an unknown user and a wrong hash", async () => {
    const { POST } = await import("./route");

    getCredentialsByUsername.mockResolvedValue(null);
    const unknown = await POST(post({ username: "ghost", passwordHash }));

    getCredentialsByUsername.mockResolvedValue({
      user: publicUser,
      passwordHash,
    });
    const wrong = await POST(
      post({ username: "ada", passwordHash: "c".repeat(64) }),
    );

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    const unknownBody = await unknown.json();
    const wrongBody = await wrong.json();
    expect(unknownBody).toEqual(wrongBody);
    expect(unknownBody).toEqual({ error: "Invalid username or password" });
  });

  it("returns 500 when lookup throws unexpectedly", async () => {
    getCredentialsByUsername.mockRejectedValue(new Error("d1 down"));
    const { POST } = await import("./route");
    const response = await POST(
      post({ username: "ada", passwordHash }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });
});
