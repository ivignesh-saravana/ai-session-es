import { beforeEach, describe, expect, it, vi } from "vitest";

type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

function createFakeD1() {
  const users: UserRow[] = [];
  const statements: { sql: string; params: unknown[] }[] = [];
  let idCounter = 0;
  let clock = 1_700_000_000_000;

  function nextId() {
    idCounter += 1;
    return `user${String(idCounter).padStart(4, "0")}${ "a".repeat(24)}`.slice(
      0,
      32,
    );
  }

  function nextTimestamp() {
    clock += 1000;
    return new Date(clock).toISOString().replace("T", " ").slice(0, 19);
  }

  function publicColumns(row: UserRow) {
    return {
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      username: row.username,
      email: row.email,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  function throwIfDuplicate(username: string, email: string, exceptId?: string) {
    const clash = users.find(
      (row) =>
        row.id !== exceptId &&
        (row.username === username || row.email === email),
    );
    if (clash) {
      const field = clash.username === username ? "username" : "email";
      throw new Error(`UNIQUE constraint failed: users.${field}`);
    }
  }

  function mapReturning(sql: string, row: UserRow | undefined) {
    if (!row) {
      return { results: [] as Record<string, unknown>[] };
    }
    if (/\bpassword_hash\b/i.test(sql) && /RETURNING/i.test(sql)) {
      return { results: [row] };
    }
    if (/RETURNING/i.test(sql) || /SELECT\s+/i.test(sql)) {
      if (/\bpassword_hash\b/i.test(sql) && /SELECT/i.test(sql)) {
        return { results: [row] };
      }
      return { results: [publicColumns(row)] };
    }
    return { results: [] as Record<string, unknown>[] };
  }

  function execute(sql: string, params: unknown[]) {
    statements.push({ sql, params });
    const compact = sql.replace(/\s+/g, " ").trim();

    if (/^INSERT\s+INTO\s+users/i.test(compact)) {
      const [firstName, lastName, username, email, passwordHash] = params as string[];
      throwIfDuplicate(username, email);
      const now = nextTimestamp();
      const row: UserRow = {
        id: nextId(),
        first_name: firstName,
        last_name: lastName,
        username,
        email,
        password_hash: passwordHash,
        created_at: now,
        updated_at: now,
      };
      users.push(row);
      return mapReturning(sql, row);
    }

    if (/^SELECT\s+/i.test(compact) && /\bWHERE\s+id\s*=\s*\?1/i.test(compact)) {
      const row = users.find((item) => item.id === params[0]);
      return mapReturning(sql, row);
    }

    if (
      /^SELECT\s+/i.test(compact) &&
      /\bWHERE\s+username\s*=\s*\?1/i.test(compact)
    ) {
      const row = users.find((item) => item.username === params[0]);
      return mapReturning(sql, row);
    }

    if (
      /^SELECT\s+/i.test(compact) &&
      /\bWHERE\s+email\s*=\s*\?1/i.test(compact)
    ) {
      const row = users.find((item) => item.email === params[0]);
      return mapReturning(sql, row);
    }

    if (/^UPDATE\s+users/i.test(compact)) {
      const id = params[params.length - 1] as string;
      const row = users.find((item) => item.id === id);
      if (!row) {
        return { results: [] as Record<string, unknown>[], meta: { changes: 0 } };
      }
      const firstName = params[0] as string;
      const lastName = params[1] as string;
      const username = params[2] as string;
      const email = params[3] as string;
      throwIfDuplicate(username, email, id);
      row.first_name = firstName;
      row.last_name = lastName;
      row.username = username;
      row.email = email;
      if (params.length >= 6) {
        row.password_hash = params[4] as string;
      }
      row.updated_at = nextTimestamp();
      return mapReturning(sql, row);
    }

    if (/^DELETE\s+FROM\s+users/i.test(compact)) {
      const index = users.findIndex((item) => item.id === params[0]);
      if (index >= 0) {
        users.splice(index, 1);
      }
      return { results: [] as Record<string, unknown>[] };
    }

    throw new Error(`Unsupported SQL in fake D1: ${compact}`);
  }

  const db = {
    statements,
    users,
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              return execute(sql, params);
            },
            async all() {
              return execute(sql, params);
            },
          };
        },
      };
    },
  };

  return db;
}

const { fakeDb, getCloudflareContext } = vi.hoisted(() => {
  const getCloudflareContext = vi.fn();
  return {
    getCloudflareContext,
    fakeDb: { current: null as ReturnType<typeof createFakeD1> | null },
  };
});

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext,
}));

const ada = {
  firstName: "Ada",
  lastName: "Lovelace",
  username: "ada@school.edu",
  email: "ada@school.edu",
  passwordHash: "a".repeat(64),
};

describe("user service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb.current = createFakeD1();
    getCloudflareContext.mockResolvedValue({
      env: { DB: fakeDb.current },
    });
  });

  it("creates a user with numbered placeholders and omits the password hash from the public result", async () => {
    const { createUser } = await import("./user-service");
    const user = await createUser(ada);

    const insert = fakeDb.current?.statements.find((statement) =>
      /INSERT\s+INTO\s+users/i.test(statement.sql),
    );
    expect(insert?.sql).toMatch(/\?1/);
    expect(insert?.sql).toMatch(/\?2/);
    expect(insert?.sql).toMatch(/\?3/);
    expect(insert?.sql).toMatch(/\?4/);
    expect(insert?.sql).toMatch(/\?5/);
    expect(insert?.params).toEqual([
      ada.firstName,
      ada.lastName,
      ada.username,
      ada.email,
      ada.passwordHash,
    ]);

    expect(user.id).toEqual(expect.any(String));
    expect(user.firstName).toBe("Ada");
    expect(user.lastName).toBe("Lovelace");
    expect(user.username).toBe("ada@school.edu");
    expect(user.email).toBe("ada@school.edu");
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("password_hash");
  });

  it("allows the same string for username and email on create", async () => {
    const { createUser } = await import("./user-service");
    const user = await createUser(ada);
    expect(user.username).toBe(user.email);
  });

  it("maps unique constraint failures to UserAlreadyExistsError", async () => {
    const { createUser, UserAlreadyExistsError } = await import("./user-service");
    await createUser(ada);

    await expect(
      createUser({
        ...ada,
        username: "other",
      }),
    ).rejects.toBeInstanceOf(UserAlreadyExistsError);

    await expect(
      createUser({
        ...ada,
        email: "other@school.edu",
      }),
    ).rejects.toBeInstanceOf(UserAlreadyExistsError);
  });

  it("returns null from getters when the user is missing", async () => {
    const { getUserById, getUserByUsername, getUserByEmail } = await import(
      "./user-service"
    );

    await expect(getUserById("missing")).resolves.toBeNull();
    await expect(getUserByUsername("missing")).resolves.toBeNull();
    await expect(getUserByEmail("missing")).resolves.toBeNull();
  });

  it("finds created users by id, username, and email without exposing the hash", async () => {
    const {
      createUser,
      getUserById,
      getUserByUsername,
      getUserByEmail,
    } = await import("./user-service");
    const created = await createUser(ada);

    const byId = await getUserById(created.id);
    const byUsername = await getUserByUsername(ada.username);
    const byEmail = await getUserByEmail(ada.email);

    expect(byId).toEqual(created);
    expect(byUsername).toEqual(created);
    expect(byEmail).toEqual(created);
    expect(byId).not.toHaveProperty("passwordHash");
    expect(byUsername).not.toHaveProperty("password_hash");
  });

  it("loads credentials with the hash for login without putting the hash on public getters", async () => {
    const { createUser, getUserByUsername, getCredentialsByUsername } =
      await import("./user-service");
    await createUser(ada);

    const credentials = await getCredentialsByUsername(ada.username);
    expect(credentials?.passwordHash).toBe(ada.passwordHash);
    expect(credentials?.user.username).toBe(ada.username);
    expect(credentials?.user).not.toHaveProperty("passwordHash");

    const publicUser = await getUserByUsername(ada.username);
    expect(publicUser).not.toHaveProperty("passwordHash");
    expect(publicUser).not.toHaveProperty("password_hash");
  });

  it("returns null credentials when the username is unknown", async () => {
    const { getCredentialsByUsername } = await import("./user-service");
    await expect(getCredentialsByUsername("nobody")).resolves.toBeNull();
  });

  it("updates fields and refreshes updated_at", async () => {
    const { createUser, updateUser, getUserById } = await import("./user-service");
    const created = await createUser(ada);

    const updated = await updateUser(created.id, {
      firstName: "Augusta",
      lastName: "King",
      username: "augusta",
      email: "augusta@school.edu",
    });

    expect(updated.firstName).toBe("Augusta");
    expect(updated.lastName).toBe("King");
    expect(updated.username).toBe("augusta");
    expect(updated.email).toBe("augusta@school.edu");
    expect(updated.updatedAt).not.toBe(created.updatedAt);

    const fetched = await getUserById(created.id);
    expect(fetched).toEqual(updated);
  });

  it("deletes a user so later lookups return null", async () => {
    const { createUser, deleteUser, getUserById } = await import("./user-service");
    const created = await createUser(ada);

    await deleteUser(created.id);
    await expect(getUserById(created.id)).resolves.toBeNull();
  });
});
