import { beforeEach, describe, expect, it, vi } from "vitest";

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

function createFakeD1() {
  const mcqs: McqRow[] = [];
  const choices: ChoiceRow[] = [];
  const statements: { sql: string; params: unknown[] }[] = [];
  let idCounter = 0;
  let clock = 1_700_000_000_000;

  function nextId() {
    idCounter += 1;
    return `mcq${String(idCounter).padStart(4, "0")}${"a".repeat(24)}`.slice(
      0,
      32,
    );
  }

  function nextTimestamp() {
    clock += 1000;
    return new Date(clock).toISOString().replace("T", " ").slice(0, 19);
  }

  function execute(sql: string, params: unknown[]) {
    statements.push({ sql, params });
    const compact = sql.replace(/\s+/g, " ").trim();

    if (/^INSERT\s+INTO\s+mcqs\b/i.test(compact)) {
      const [name, description] = params as string[];
      const now = nextTimestamp();
      const row: McqRow = {
        id: nextId(),
        name,
        description,
        created_at: now,
        updated_at: now,
      };
      mcqs.push(row);
      return { results: [row] };
    }

    if (/^INSERT\s+INTO\s+mcq_choices\b/i.test(compact)) {
      const [mcqId, label, isCorrect, position] = params;
      const now = nextTimestamp();
      const row: ChoiceRow = {
        id: nextId(),
        mcq_id: String(mcqId),
        label: String(label),
        is_correct: Number(isCorrect),
        position: Number(position),
        created_at: now,
        updated_at: now,
      };
      choices.push(row);
      return { results: [row] };
    }

    if (
      /^SELECT\s+/i.test(compact) &&
      /\bFROM\s+mcq_choices\b/i.test(compact) &&
      /\bmcq_id\s*=\s*\?1/i.test(compact)
    ) {
      const mcqId = params[0];
      const rows = choices
        .filter((row) => row.mcq_id === mcqId)
        .sort((a, b) => a.position - b.position);
      return { results: rows };
    }

    if (
      /^SELECT\s+/i.test(compact) &&
      /\bFROM\s+mcqs\b/i.test(compact) &&
      /\bWHERE\s+id\s*=\s*\?1/i.test(compact)
    ) {
      const row = mcqs.find((item) => item.id === params[0]);
      return { results: row ? [row] : [] };
    }

    if (/^SELECT\s+/i.test(compact) && /\bFROM\s+mcqs\b/i.test(compact)) {
      return { results: [...mcqs] };
    }

    if (/^UPDATE\s+mcqs\b/i.test(compact)) {
      const id = params[params.length - 1] as string;
      const row = mcqs.find((item) => item.id === id);
      if (!row) {
        return { results: [], meta: { changes: 0 } };
      }
      row.name = params[0] as string;
      row.description = params[1] as string;
      row.updated_at = nextTimestamp();
      return { results: [row] };
    }

    if (/^DELETE\s+FROM\s+mcq_choices\b/i.test(compact)) {
      const mcqId = params[0];
      for (let i = choices.length - 1; i >= 0; i -= 1) {
        if (choices[i].mcq_id === mcqId) {
          choices.splice(i, 1);
        }
      }
      return { results: [] };
    }

    if (/^DELETE\s+FROM\s+mcqs\b/i.test(compact)) {
      const id = params[0];
      const index = mcqs.findIndex((item) => item.id === id);
      if (index >= 0) {
        mcqs.splice(index, 1);
      }
      for (let i = choices.length - 1; i >= 0; i -= 1) {
        if (choices[i].mcq_id === id) {
          choices.splice(i, 1);
        }
      }
      return { results: [] };
    }

    throw new Error(`Unsupported SQL in fake D1: ${compact}`);
  }

  return {
    statements,
    mcqs,
    choices,
    prepare(sql: string) {
      const bound = (params: unknown[]) => ({
        async run() {
          return execute(sql, params);
        },
        async all() {
          return execute(sql, params);
        },
      });
      return {
        bind(...params: unknown[]) {
          return bound(params);
        },
        async run() {
          return execute(sql, []);
        },
        async all() {
          return execute(sql, []);
        },
      };
    },
  };
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

const photosynthesis = {
  name: "Photosynthesis",
  description: "Grade 5 science",
  choices: [
    { label: "Plants make food from sunlight", isCorrect: true },
    { label: "Plants eat soil", isCorrect: false },
  ],
};

describe("mcq service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb.current = createFakeD1();
    getCloudflareContext.mockResolvedValue({
      env: { DB: fakeDb.current },
    });
  });

  it("creates an MCQ with numbered placeholders, positions from array order, and camelCase isCorrect", async () => {
    const { createMcq } = await import("./mcq-service");
    const created = await createMcq(photosynthesis);

    const mcqInsert = fakeDb.current?.statements.find((statement) =>
      /INSERT\s+INTO\s+mcqs\b/i.test(statement.sql),
    );
    expect(mcqInsert?.sql).toMatch(/\?1/);
    expect(mcqInsert?.sql).toMatch(/\?2/);
    expect(mcqInsert?.params).toEqual([
      photosynthesis.name,
      photosynthesis.description,
    ]);

    const choiceInserts = fakeDb.current?.statements.filter((statement) =>
      /INSERT\s+INTO\s+mcq_choices\b/i.test(statement.sql),
    );
    expect(choiceInserts).toHaveLength(2);
    expect(choiceInserts?.[0]?.sql).toMatch(/\?1/);
    expect(choiceInserts?.[0]?.params[0]).toBe(created.id);
    expect(choiceInserts?.[0]?.params[1]).toBe(
      photosynthesis.choices[0].label,
    );
    expect(choiceInserts?.[0]?.params[3]).toBe(0);
    expect(choiceInserts?.[1]?.params[1]).toBe(
      photosynthesis.choices[1].label,
    );
    expect(choiceInserts?.[1]?.params[3]).toBe(1);

    expect(created.name).toBe("Photosynthesis");
    expect(created.description).toBe("Grade 5 science");
    expect(created.choices).toHaveLength(2);
    expect(created.choices[0]).toMatchObject({
      label: "Plants make food from sunlight",
      isCorrect: true,
      position: 0,
    });
    expect(created.choices[1]).toMatchObject({
      label: "Plants eat soil",
      isCorrect: false,
      position: 1,
    });
    expect(created.choices[0]).not.toHaveProperty("is_correct");
  });

  it("rejects fewer than 2 or more than 6 choices with McqValidationError", async () => {
    const { createMcq, McqValidationError } = await import("./mcq-service");

    await expect(
      createMcq({
        ...photosynthesis,
        choices: [{ label: "Only one", isCorrect: true }],
      }),
    ).rejects.toBeInstanceOf(McqValidationError);

    await expect(
      createMcq({
        ...photosynthesis,
        choices: Array.from({ length: 7 }, (_, index) => ({
          label: `Choice ${index}`,
          isCorrect: index === 0,
        })),
      }),
    ).rejects.toBeInstanceOf(McqValidationError);

    expect(
      fakeDb.current?.statements.some((statement) =>
        /INSERT\s+INTO\s+mcqs\b/i.test(statement.sql),
      ),
    ).toBe(false);
  });

  it("rejects a blank name, blank choice labels, and not exactly one correct choice", async () => {
    const { createMcq, McqValidationError } = await import("./mcq-service");

    await expect(
      createMcq({ ...photosynthesis, name: "   " }),
    ).rejects.toBeInstanceOf(McqValidationError);

    await expect(
      createMcq({
        ...photosynthesis,
        choices: [
          { label: "  ", isCorrect: true },
          { label: "Valid", isCorrect: false },
        ],
      }),
    ).rejects.toBeInstanceOf(McqValidationError);

    await expect(
      createMcq({
        ...photosynthesis,
        choices: [
          { label: "A", isCorrect: false },
          { label: "B", isCorrect: false },
        ],
      }),
    ).rejects.toBeInstanceOf(McqValidationError);

    await expect(
      createMcq({
        ...photosynthesis,
        choices: [
          { label: "A", isCorrect: true },
          { label: "B", isCorrect: true },
        ],
      }),
    ).rejects.toBeInstanceOf(McqValidationError);
  });

  it("lists MCQs without choices", async () => {
    const { createMcq, listMcqs } = await import("./mcq-service");
    const created = await createMcq(photosynthesis);

    const listed = await listMcqs();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: created.id,
      name: "Photosynthesis",
      description: "Grade 5 science",
    });
    expect(listed[0]).not.toHaveProperty("choices");
  });

  it("returns the question and ordered choices from getMcqById, or null when missing", async () => {
    const { createMcq, getMcqById } = await import("./mcq-service");
    const created = await createMcq({
      name: "Order",
      description: "",
      choices: [
        { label: "First", isCorrect: false },
        { label: "Second", isCorrect: true },
        { label: "Third", isCorrect: false },
      ],
    });

    const found = await getMcqById(created.id);
    expect(found?.choices.map((choice) => choice.label)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(found?.choices[1].isCorrect).toBe(true);

    await expect(getMcqById("missing")).resolves.toBeNull();
  });

  it("updates name, description, and updated_at and replaces choices", async () => {
    const { createMcq, updateMcq, getMcqById } = await import("./mcq-service");
    const created = await createMcq(photosynthesis);

    const updated = await updateMcq(created.id, {
      name: "Respiration",
      description: "Grade 6",
      choices: [
        { label: "Oxygen", isCorrect: false },
        { label: "Carbon dioxide", isCorrect: false },
        { label: "Both gases", isCorrect: true },
      ],
    });

    expect(updated.name).toBe("Respiration");
    expect(updated.description).toBe("Grade 6");
    expect(updated.updatedAt).not.toBe(created.updatedAt);
    expect(updated.choices).toHaveLength(3);
    expect(updated.choices.map((choice) => choice.label)).toEqual([
      "Oxygen",
      "Carbon dioxide",
      "Both gases",
    ]);
    expect(updated.choices.filter((choice) => choice.isCorrect)).toHaveLength(
      1,
    );

    const fetched = await getMcqById(created.id);
    expect(fetched).toEqual(updated);
    expect(fakeDb.current?.choices).toHaveLength(3);
  });

  it("deletes an MCQ so later lookups return null and cascaded choices are gone", async () => {
    const { createMcq, deleteMcq, getMcqById } = await import("./mcq-service");
    const created = await createMcq(photosynthesis);

    await deleteMcq(created.id);

    await expect(getMcqById(created.id)).resolves.toBeNull();
    expect(fakeDb.current?.choices).toHaveLength(0);
  });

  it("returns preview choices without isCorrect", async () => {
    const { createMcq, getMcqForPreview } = await import("./mcq-service");
    const created = await createMcq(photosynthesis);

    const preview = await getMcqForPreview(created.id);
    expect(preview?.id).toBe(created.id);
    expect(preview?.name).toBe("Photosynthesis");
    expect(preview?.choices).toHaveLength(2);
    expect(preview?.choices[0]).toEqual({
      id: created.choices[0].id,
      label: photosynthesis.choices[0].label,
      position: 0,
    });
    expect(preview?.choices[0]).not.toHaveProperty("isCorrect");
    expect(preview?.choices[0]).not.toHaveProperty("is_correct");

    await expect(getMcqForPreview("missing")).resolves.toBeNull();
  });
});
