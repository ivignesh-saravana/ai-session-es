import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REQUIRED_COLUMNS = [
  "id",
  "first_name",
  "last_name",
  "username",
  "email",
  "password_hash",
  "created_at",
  "updated_at",
] as const;

function loadMigrationsSql(): string {
  const dir = join(process.cwd(), "migrations");
  if (!existsSync(dir)) {
    throw new Error("migrations directory is missing");
  }

  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error("no SQL migration files found");
  }

  return files.map((file) => readFileSync(join(dir, file), "utf8")).join("\n");
}

function createUsersTableBody(sql: string): string {
  const match = sql.match(
    /CREATE\s+TABLE\s+users\s*\(([\s\S]*?)\)\s*;/i,
  );
  if (!match) {
    throw new Error("CREATE TABLE users statement is missing");
  }
  return match[1];
}

describe("users schema migration", () => {
  it("creates a users table", () => {
    const sql = loadMigrationsSql();
    expect(sql).toMatch(/CREATE\s+TABLE\s+users\b/i);
  });

  it("defines the required user columns", () => {
    const body = createUsersTableBody(loadMigrationsSql());
    for (const column of REQUIRED_COLUMNS) {
      expect(body).toMatch(new RegExp(`\\b${column}\\b`, "i"));
    }
  });

  it("stores a password hash column rather than plaintext password", () => {
    const body = createUsersTableBody(loadMigrationsSql());
    expect(body).toMatch(/\bpassword_hash\b/i);
    expect(body).not.toMatch(/^\s*password\s+/im);
  });

  it("uniquely indexes username and email", () => {
    const sql = loadMigrationsSql();
    expect(sql).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+\S+\s+ON\s+users\s*\(\s*username\s*\)/i,
    );
    expect(sql).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+\S+\s+ON\s+users\s*\(\s*email\s*\)/i,
    );
  });
});
