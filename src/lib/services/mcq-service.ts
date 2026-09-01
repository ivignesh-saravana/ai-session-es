import { getCloudflareContext } from "@opennextjs/cloudflare";

export class McqValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McqValidationError";
  }
}

export class McqNotFoundError extends Error {
  constructor(message = "Question not found") {
    super(message);
    this.name = "McqNotFoundError";
  }
}

export type McqListItem = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type McqChoice = {
  id: string;
  label: string;
  isCorrect: boolean;
  position: number;
};

export type Mcq = McqListItem & {
  choices: McqChoice[];
};

export type McqPreviewChoice = {
  id: string;
  label: string;
  position: number;
};

export type McqPreview = {
  id: string;
  name: string;
  description: string;
  choices: McqPreviewChoice[];
};

export type McqChoiceInput = {
  label: string;
  isCorrect: boolean;
};

export type McqInput = {
  name: string;
  description: string;
  choices: McqChoiceInput[];
};

type McqRow = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

type ChoiceRow = {
  id: string;
  mcq_id: string;
  label: string;
  is_correct: number;
  position: number;
  created_at: string;
  updated_at: string;
};

const MCQ_COLUMNS = "id, name, description, created_at, updated_at";
const CHOICE_COLUMNS =
  "id, mcq_id, label, is_correct, position, created_at, updated_at";

async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

function toListItem(row: McqRow): McqListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toChoice(row: ChoiceRow): McqChoice {
  return {
    id: row.id,
    label: row.label,
    isCorrect: row.is_correct === 1,
    position: row.position,
  };
}

function normalizeInput(input: McqInput): {
  name: string;
  description: string;
  choices: { label: string; isCorrect: boolean }[];
} {
  const name = input.name.trim();
  if (!name) {
    throw new McqValidationError("Name is required");
  }

  const description =
    typeof input.description === "string" ? input.description.trim() : "";

  if (!Array.isArray(input.choices) || input.choices.length < 2) {
    throw new McqValidationError("At least two choices are required");
  }
  if (input.choices.length > 6) {
    throw new McqValidationError("At most six choices are allowed");
  }

  const choices = input.choices.map((choice) => ({
    label: choice.label.trim(),
    isCorrect: Boolean(choice.isCorrect),
  }));

  if (choices.some((choice) => !choice.label)) {
    throw new McqValidationError("Choice labels cannot be blank");
  }

  const correctCount = choices.filter((choice) => choice.isCorrect).length;
  if (correctCount !== 1) {
    throw new McqValidationError("Exactly one choice must be marked correct");
  }

  return { name, description, choices };
}

async function loadChoices(
  db: Awaited<ReturnType<typeof getDb>>,
  mcqId: string,
): Promise<McqChoice[]> {
  const { results } = await db
    .prepare(
      `SELECT ${CHOICE_COLUMNS} FROM mcq_choices WHERE mcq_id = ?1 ORDER BY position ASC`,
    )
    .bind(mcqId)
    .all<ChoiceRow>();
  return results.map(toChoice);
}

async function insertChoices(
  db: Awaited<ReturnType<typeof getDb>>,
  mcqId: string,
  choices: { label: string; isCorrect: boolean }[],
): Promise<McqChoice[]> {
  const inserted: McqChoice[] = [];
  for (const [position, choice] of choices.entries()) {
    const { results } = await db
      .prepare(
        `INSERT INTO mcq_choices (mcq_id, label, is_correct, position)
         VALUES (?1, ?2, ?3, ?4)
         RETURNING ${CHOICE_COLUMNS}`,
      )
      .bind(mcqId, choice.label, choice.isCorrect ? 1 : 0, position)
      .all<ChoiceRow>();
    const row = results[0];
    if (!row) {
      throw new Error("Failed to create choice");
    }
    inserted.push(toChoice(row));
  }
  return inserted;
}

export async function createMcq(input: McqInput): Promise<Mcq> {
  const normalized = normalizeInput(input);
  const db = await getDb();
  const { results } = await db
    .prepare(
      `INSERT INTO mcqs (name, description)
       VALUES (?1, ?2)
       RETURNING ${MCQ_COLUMNS}`,
    )
    .bind(normalized.name, normalized.description)
    .all<McqRow>();

  const row = results[0];
  if (!row) {
    throw new Error("Failed to create question");
  }

  const createdChoices = await insertChoices(db, row.id, normalized.choices);
  return { ...toListItem(row), choices: createdChoices };
}

export async function listMcqs(): Promise<McqListItem[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT ${MCQ_COLUMNS} FROM mcqs ORDER BY created_at DESC`,
    )
    .all<McqRow>();
  return results.map(toListItem);
}

export async function getMcqById(id: string): Promise<Mcq | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(`SELECT ${MCQ_COLUMNS} FROM mcqs WHERE id = ?1`)
    .bind(id)
    .all<McqRow>();
  const row = results[0];
  if (!row) {
    return null;
  }
  const choices = await loadChoices(db, row.id);
  return { ...toListItem(row), choices };
}

export async function getMcqForPreview(
  id: string,
): Promise<McqPreview | null> {
  const mcq = await getMcqById(id);
  if (!mcq) {
    return null;
  }
  return {
    id: mcq.id,
    name: mcq.name,
    description: mcq.description,
    choices: mcq.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      position: choice.position,
    })),
  };
}

export async function updateMcq(id: string, input: McqInput): Promise<Mcq> {
  const normalized = normalizeInput(input);
  const db = await getDb();
  const { results } = await db
    .prepare(
      `UPDATE mcqs
       SET name = ?1, description = ?2, updated_at = datetime('now')
       WHERE id = ?3
       RETURNING ${MCQ_COLUMNS}`,
    )
    .bind(normalized.name, normalized.description, id)
    .all<McqRow>();

  const row = results[0];
  if (!row) {
    throw new McqNotFoundError();
  }

  await db
    .prepare("DELETE FROM mcq_choices WHERE mcq_id = ?1")
    .bind(id)
    .run();

  const replaced = await insertChoices(db, id, normalized.choices);
  return { ...toListItem(row), choices: replaced };
}

export async function deleteMcq(id: string): Promise<void> {
  const db = await getDb();
  await db.prepare("DELETE FROM mcqs WHERE id = ?1").bind(id).run();
}

export type McqAttempt = {
  id: string;
  mcqId: string;
  selectedChoiceId: string;
  choiceLabel: string;
  isCorrect: boolean;
  createdAt: string;
};

type AttemptRow = {
  id: string;
  mcq_id: string;
  selected_choice_id: string;
  choice_label: string;
  is_correct: number;
  created_at: string;
};

function toAttempt(row: AttemptRow): McqAttempt {
  return {
    id: row.id,
    mcqId: row.mcq_id,
    selectedChoiceId: row.selected_choice_id,
    choiceLabel: row.choice_label,
    isCorrect: row.is_correct === 1,
    createdAt: row.created_at,
  };
}

export async function createAttempt(input: {
  mcqId: string;
  choiceId: string;
}): Promise<McqAttempt> {
  const mcq = await getMcqById(input.mcqId);
  if (!mcq) {
    throw new McqNotFoundError();
  }

  const choice = mcq.choices.find((item) => item.id === input.choiceId);
  if (!choice) {
    throw new McqValidationError("Choice does not belong to this question");
  }

  const db = await getDb();
  const { results } = await db
    .prepare(
      `INSERT INTO mcq_attempts (mcq_id, selected_choice_id, choice_label, is_correct)
       VALUES (?1, ?2, ?3, ?4)
       RETURNING id, mcq_id, selected_choice_id, choice_label, is_correct, created_at`,
    )
    .bind(mcq.id, choice.id, choice.label, choice.isCorrect ? 1 : 0)
    .all<AttemptRow>();

  const row = results[0];
  if (!row) {
    throw new Error("Failed to record attempt");
  }
  return toAttempt(row);
}
