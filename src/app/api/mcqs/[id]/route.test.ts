import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getMcqById,
  updateMcq,
  deleteMcq,
  McqValidationError,
  McqNotFoundError,
} = vi.hoisted(() => {
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
    getMcqById: vi.fn(),
    updateMcq: vi.fn(),
    deleteMcq: vi.fn(),
    McqValidationError,
    McqNotFoundError,
  };
});

vi.mock("@/lib/services/mcq-service", () => ({
  getMcqById,
  updateMcq,
  deleteMcq,
  McqValidationError,
  McqNotFoundError,
}));

const mcq = {
  id: "mcq1",
  name: "Photosynthesis",
  description: "Grade 5",
  createdAt: "2026-01-01 00:00:00",
  updatedAt: "2026-01-01 00:00:00",
  choices: [
    {
      id: "c1",
      label: "Sunlight",
      isCorrect: true,
      position: 0,
    },
    {
      id: "c2",
      label: "Soil",
      isCorrect: false,
      position: 1,
    },
  ],
};

const validBody = {
  name: "Respiration",
  description: "Grade 6",
  choices: [
    { label: "Oxygen", isCorrect: false },
    { label: "Both gases", isCorrect: true },
  ],
};

const context = {
  params: Promise.resolve({ id: "mcq1" }),
};

function getRequest() {
  return new Request("http://localhost/api/mcqs/mcq1", { method: "GET" });
}

function putRequest(body: unknown) {
  return new Request("http://localhost/api/mcqs/mcq1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest() {
  return new Request("http://localhost/api/mcqs/mcq1", { method: "DELETE" });
}

describe("GET /api/mcqs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the question and choices", async () => {
    getMcqById.mockResolvedValue(mcq);
    const { GET } = await import("./route");
    const response = await GET(getRequest(), context);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(getMcqById).toHaveBeenCalledWith("mcq1");
    expect(json).toEqual(mcq);
  });

  it("returns 404 when the question is missing", async () => {
    getMcqById.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(getRequest(), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Question not found" });
  });

  it("returns 500 when getMcqById throws", async () => {
    getMcqById.mockRejectedValue(new Error("d1 down"));
    const { GET } = await import("./route");
    const response = await GET(getRequest(), context);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });
});

describe("PUT /api/mcqs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the question and returns 200", async () => {
    const updated = { ...mcq, name: "Respiration" };
    updateMcq.mockResolvedValue(updated);
    const { PUT } = await import("./route");
    const response = await PUT(putRequest(validBody), context);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(updateMcq).toHaveBeenCalledWith("mcq1", validBody);
    expect(json).toEqual(updated);
  });

  it("returns 400 when the service rejects validation", async () => {
    updateMcq.mockRejectedValue(new McqValidationError("Name is required"));
    const { PUT } = await import("./route");
    const response = await PUT(putRequest(validBody), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Name is required" });
  });

  it("returns 404 when the question is missing", async () => {
    updateMcq.mockRejectedValue(new McqNotFoundError());
    const { PUT } = await import("./route");
    const response = await PUT(putRequest(validBody), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Question not found" });
  });

  it("returns 500 when updateMcq throws unexpectedly", async () => {
    updateMcq.mockRejectedValue(new Error("d1 down"));
    const { PUT } = await import("./route");
    const response = await PUT(putRequest(validBody), context);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });
});

describe("DELETE /api/mcqs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the question and returns 200", async () => {
    getMcqById.mockResolvedValue(mcq);
    deleteMcq.mockResolvedValue(undefined);
    const { DELETE } = await import("./route");
    const response = await DELETE(deleteRequest(), context);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(getMcqById).toHaveBeenCalledWith("mcq1");
    expect(deleteMcq).toHaveBeenCalledWith("mcq1");
    expect(json).toEqual({ ok: true });
  });

  it("returns 404 when the question is missing", async () => {
    getMcqById.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const response = await DELETE(deleteRequest(), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Question not found" });
    expect(deleteMcq).not.toHaveBeenCalled();
  });

  it("returns 500 when deleteMcq throws", async () => {
    getMcqById.mockResolvedValue(mcq);
    deleteMcq.mockRejectedValue(new Error("d1 down"));
    const { DELETE } = await import("./route");
    const response = await DELETE(deleteRequest(), context);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });
});
