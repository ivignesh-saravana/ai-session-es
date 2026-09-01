import { getCloudflareContext } from "@opennextjs/cloudflare";

export class UserAlreadyExistsError extends Error {
  constructor(message = "username or email already registered") {
    super(message);
    this.name = "UserAlreadyExistsError";
  }
}

export type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserInput = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
};

export type UpdateUserInput = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
};

export type UserCredentials = {
  user: PublicUser;
  passwordHash: string;
};

type PublicUserRow = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  created_at: string;
  updated_at: string;
};

type CredentialRow = PublicUserRow & {
  password_hash: string;
};

const PUBLIC_USER_COLUMNS =
  "id, first_name, last_name, username, email, created_at, updated_at";

async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

function toPublicUser(row: PublicUserRow): PublicUser {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    username: row.username,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`
      : String(error);
  return /UNIQUE constraint failed/i.test(message);
}

async function runUnique<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new UserAlreadyExistsError();
    }
    throw error;
  }
}

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const db = await getDb();
  const { results } = await runUnique(() =>
    db
      .prepare(
        `INSERT INTO users (first_name, last_name, username, email, password_hash)
         VALUES (?1, ?2, ?3, ?4, ?5)
         RETURNING ${PUBLIC_USER_COLUMNS}`,
      )
      .bind(
        input.firstName,
        input.lastName,
        input.username,
        input.email,
        input.passwordHash,
      )
      .all<PublicUserRow>(),
  );

  const row = results[0];
  if (!row) {
    throw new Error("Failed to create user");
  }
  return toPublicUser(row);
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?1`,
    )
    .bind(id)
    .all<PublicUserRow>();
  const row = results[0];
  return row ? toPublicUser(row) : null;
}

export async function getUserByUsername(
  username: string,
): Promise<PublicUser | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE username = ?1`,
    )
    .bind(username)
    .all<PublicUserRow>();
  const row = results[0];
  return row ? toPublicUser(row) : null;
}

export async function getUserByEmail(email: string): Promise<PublicUser | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE email = ?1`)
    .bind(email)
    .all<PublicUserRow>();
  const row = results[0];
  return row ? toPublicUser(row) : null;
}

export async function getCredentialsByUsername(
  username: string,
): Promise<UserCredentials | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT ${PUBLIC_USER_COLUMNS}, password_hash FROM users WHERE username = ?1`,
    )
    .bind(username)
    .all<CredentialRow>();
  const row = results[0];
  if (!row) {
    return null;
  }
  return {
    user: toPublicUser(row),
    passwordHash: row.password_hash,
  };
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<PublicUser> {
  const db = await getDb();
  const { results } = await runUnique(() =>
    db
      .prepare(
        `UPDATE users
         SET first_name = ?1, last_name = ?2, username = ?3, email = ?4, updated_at = datetime('now')
         WHERE id = ?5
         RETURNING ${PUBLIC_USER_COLUMNS}`,
      )
      .bind(
        input.firstName,
        input.lastName,
        input.username,
        input.email,
        id,
      )
      .all<PublicUserRow>(),
  );

  const row = results[0];
  if (!row) {
    throw new Error("User not found");
  }
  return toPublicUser(row);
}

export async function deleteUser(id: string): Promise<void> {
  const db = await getDb();
  await db.prepare("DELETE FROM users WHERE id = ?1").bind(id).run();
}
