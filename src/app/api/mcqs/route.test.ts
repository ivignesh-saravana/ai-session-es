import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listMcqs,
  createMcq,
  McqValidationError,
} = vi.hoisted(() => {
  class McqValidationError extends Error {
    constructor(message = "Invalid question") {
      super(message);
      this.name = "McqValidationError";
    }
  }

  return {
    listMcqs: vi.fn(),
    createMcq: vi.fn(),
    McqValidationError,
  };
});

vi.mock("@/lib/services/mcq-service", () => ({
  listMcqs,
  createMcq,
  McqValidationError,
}));

const listItem = {
  id: "mcq1",
  name: "Photosynthesis",
  description: "Grade 5",
  createdAt: "2026-01-01 00:00:00",
  updatedAt: "2026-01-01 00:00:00",
};

const createdMcq = {
  ...listItem,
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
  name: "Photosynthesis",
  description: "Grade 5",
  choices: [
    { label: "Sunlight", isCorrect: true },
    { label: "Soil", isCorrect: false },
  ],
};

function getRequest() {
  return new Request("http://localhost/api/mcqs", { method: "GET" });
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/mcqs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/mcqs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the list of questions", async () => {
    listMcqs.mockResolvedValue([listItem]);
    const { GET } = await import("./route");
    const response = await GET(getRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ mcqs: [listItem] });
    expect(json.mcqs[0]).not.toHaveProperty("choices");
  });

  it("returns 500 when listMcqs throws", async () => {
    listMcqs.mockRejectedValue(new Error("d1 down"));
    const { GET } = await import("./route");
    const response = await GET(getRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });
});

describe("POST /api/mcqs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a question and returns 201", async () => {
    createMcq.mockResolvedValue(createdMcq);
    const { POST } = await import("./route");
    const response = await POST(postRequest(validBody));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(createMcq).toHaveBeenCalledWith(validBody);
    expect(json).toEqual(createdMcq);
  });

  it("returns 400 when the body is invalid JSON", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/mcqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(createMcq).not.toHaveBeenCalled();
  });

  it("returns 400 when choices are missing", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      postRequest({ name: "Photosynthesis", description: "" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(createMcq).not.toHaveBeenCalled();
  });

  it("returns 400 when the service rejects validation", async () => {
    createMcq.mockRejectedValue(new McqValidationError("Name is required"));
    const { POST } = await import("./route");
    const response = await POST(postRequest(validBody));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Name is required" });
  });

  it("returns 500 when createMcq throws unexpectedly", async () => {
    createMcq.mockRejectedValue(new Error("d1 down"));
    const { POST } = await import("./route");
    const response = await POST(postRequest(validBody));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });
});
