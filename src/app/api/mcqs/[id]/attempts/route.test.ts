import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAttempt, McqValidationError, McqNotFoundError } = vi.hoisted(
  () => {
    class McqValidationError extends Error {
      constructor(message = "Invalid question") {
        super(message);
        this.name = "McqValidationError";
      }
    }
    class McqNotFoundError extends Error {
      constructor(message = "Question not found") {
        super(message);
        this.name = "McqNotFoundError";
      }
    }
    return {
      createAttempt: vi.fn(),
      McqValidationError,
      McqNotFoundError,
    };
  },
);

vi.mock("@/lib/services/mcq-service", () => ({
  createAttempt,
  McqValidationError,
  McqNotFoundError,
}));

const attempt = {
  id: "att1",
  mcqId: "mcq1",
  selectedChoiceId: "c1",
  choiceLabel: "Sunlight",
  isCorrect: true,
  createdAt: "2026-01-01 00:00:00",
};

const context = {
  params: Promise.resolve({ id: "mcq1" }),
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/mcqs/mcq1/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/mcqs/:id/attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records an attempt and returns 201", async () => {
    createAttempt.mockResolvedValue(attempt);
    const { POST } = await import("./route");
    const response = await POST(postRequest({ choiceId: "c1" }), context);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(createAttempt).toHaveBeenCalledWith({
      mcqId: "mcq1",
      choiceId: "c1",
    });
    expect(json).toEqual(attempt);
  });

  it("returns 400 when choiceId is missing", async () => {
    const { POST } = await import("./route");
    const response = await POST(postRequest({}), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(createAttempt).not.toHaveBeenCalled();
  });

  it("returns 400 when the choice does not belong to the question", async () => {
    createAttempt.mockRejectedValue(
      new McqValidationError("Choice does not belong to this question"),
    );
    const { POST } = await import("./route");
    const response = await POST(postRequest({ choiceId: "c9" }), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Choice does not belong to this question",
    });
  });

  it("returns 404 when the question is missing", async () => {
    createAttempt.mockRejectedValue(new McqNotFoundError());
    const { POST } = await import("./route");
    const response = await POST(postRequest({ choiceId: "c1" }), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Question not found" });
  });

  it("returns 500 when createAttempt throws unexpectedly", async () => {
    createAttempt.mockRejectedValue(new Error("d1 down"));
    const { POST } = await import("./route");
    const response = await POST(postRequest({ choiceId: "c1" }), context);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });
});
