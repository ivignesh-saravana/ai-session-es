import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MCQ_COLUMNS = [
  "id",
  "name",
  "description",
  "created_at",
  "updated_at",
] as const;

const CHOICE_COLUMNS = [
  "id",
  "mcq_id",
  "label",
  "is_correct",
  "position",
  "created_at",
  "updated_at",
] as const;

const ATTEMPT_COLUMNS = [
  "id",
  "mcq_id",
  "selected_choice_id",
  "choice_label",
  "is_correct",
  "created_at",
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

function createTableBody(sql: string, tableName: string): string {
  const match = sql.match(
    new RegExp(`CREATE\\s+TABLE\\s+${tableName}\\s*\\(([\\s\\S]*?)\\)\\s*;`, "i"),
  );
  if (!match) {
    throw new Error(`CREATE TABLE ${tableName} statement is missing`);
  }
  return match[1];
}

describe("mcq schema migration", () => {
  it("creates an mcqs table with the required columns", () => {
    const sql = loadMigrationsSql();
    expect(sql).toMatch(/CREATE\s+TABLE\s+mcqs\b/i);
    const body = createTableBody(sql, "mcqs");
    for (const column of MCQ_COLUMNS) {
      expect(body).toMatch(new RegExp(`\\b${column}\\b`, "i"));
    }
  });

  it("creates an mcq_choices table with required columns and a cascade FK to mcqs", () => {
    const sql = loadMigrationsSql();
    expect(sql).toMatch(/CREATE\s+TABLE\s+mcq_choices\b/i);
    const body = createTableBody(sql, "mcq_choices");
    for (const column of CHOICE_COLUMNS) {
      expect(body).toMatch(new RegExp(`\\b${column}\\b`, "i"));
    }
    expect(body).toMatch(
      /FOREIGN\s+KEY\s*\(\s*mcq_id\s*\)\s*REFERENCES\s+mcqs\s*\(\s*id\s*\)\s*ON\s+DELETE\s+CASCADE/i,
    );
  });

  it("creates an mcq_attempts table with required columns and a cascade FK to mcqs", () => {
    const sql = loadMigrationsSql();
    expect(sql).toMatch(/CREATE\s+TABLE\s+mcq_attempts\b/i);
    const body = createTableBody(sql, "mcq_attempts");
    for (const column of ATTEMPT_COLUMNS) {
      expect(body).toMatch(new RegExp(`\\b${column}\\b`, "i"));
    }
    expect(body).toMatch(
      /FOREIGN\s+KEY\s*\(\s*mcq_id\s*\)\s*REFERENCES\s+mcqs\s*\(\s*id\s*\)\s*ON\s+DELETE\s+CASCADE/i,
    );
  });

  it("does not foreign-key attempts.selected_choice_id to mcq_choices", () => {
    const body = createTableBody(loadMigrationsSql(), "mcq_attempts");
    expect(body).not.toMatch(/REFERENCES\s+mcq_choices\b/i);
  });

  it("indexes mcq_choices by mcq_id and uniquely indexes one correct choice per question", () => {
    const sql = loadMigrationsSql();
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+\S+\s+ON\s+mcq_choices\s*\(\s*mcq_id\s*\)/i,
    );
    expect(sql).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+\S+\s+ON\s+mcq_choices\s*\(\s*mcq_id\s*\)\s+WHERE\s+is_correct\s*=\s*1/i,
    );
  });

  it("indexes mcq_attempts by mcq_id", () => {
    const sql = loadMigrationsSql();
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+\S+\s+ON\s+mcq_attempts\s*\(\s*mcq_id\s*\)/i,
    );
  });
});
