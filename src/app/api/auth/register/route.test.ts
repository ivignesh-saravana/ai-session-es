import { beforeEach, describe, expect, it, vi } from "vitest";

const { createUser, UserAlreadyExistsError } = vi.hoisted(() => {
  class UserAlreadyExistsError extends Error {
    constructor(message = "username or email already registered") {
      super(message);
      this.name = "UserAlreadyExistsError";
    }
  }

  return {
    createUser: vi.fn(),
    UserAlreadyExistsError,
  };
});

vi.mock("@/lib/services/user-service", () => ({
  createUser,
  UserAlreadyExistsError,
}));

function post(body: unknown) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  firstName: "Ada",
  lastName: "Lovelace",
  username: "ada@school.edu",
  email: "ada@school.edu",
  passwordHash: "a".repeat(64),
};

const publicUser = {
  id: "user1",
  firstName: "Ada",
  lastName: "Lovelace",
  username: "ada@school.edu",
  email: "ada@school.edu",
  createdAt: "2026-01-01 00:00:00",
  updatedAt: "2026-01-01 00:00:00",
};

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a user and returns 201 without a password", async () => {
    createUser.mockResolvedValue(publicUser);
    const { POST } = await import("./route");
    const response = await POST(post(validBody));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(createUser).toHaveBeenCalledWith({
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada@school.edu",
      email: "ada@school.edu",
      passwordHash: validBody.passwordHash,
    });
    expect(json).toEqual(publicUser);
    expect(json).not.toHaveProperty("passwordHash");
    expect(json).not.toHaveProperty("password_hash");
  });

  it("returns 400 when required fields are missing", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post({
        firstName: "Ada",
        email: "ada@school.edu",
        passwordHash: validBody.passwordHash,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("returns 400 when the email is invalid", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post({ ...validBody, email: "not-an-email" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("returns 400 when passwordHash is not 64-character hex", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post({ ...validBody, passwordHash: "plaintext-password" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("returns 409 when the user already exists", async () => {
    createUser.mockRejectedValue(new UserAlreadyExistsError());
    const { POST } = await import("./route");
    const response = await POST(post(validBody));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "username or email already registered",
    });
  });

  it("returns 500 when createUser throws unexpectedly", async () => {
    createUser.mockRejectedValue(new Error("d1 down"));
    const { POST } = await import("./route");
    const response = await POST(post(validBody));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });
});
