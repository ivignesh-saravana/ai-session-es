import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMcqForPreview } = vi.hoisted(() => ({
  getMcqForPreview: vi.fn(),
}));

vi.mock("@/lib/services/mcq-service", () => ({
  getMcqForPreview,
}));

const preview = {
  id: "mcq1",
  name: "Photosynthesis",
  description: "Grade 5",
  choices: [
    { id: "c1", label: "Sunlight", position: 0 },
    { id: "c2", label: "Soil", position: 1 },
  ],
};

const context = {
  params: Promise.resolve({ id: "mcq1" }),
};

function getRequest() {
  return new Request("http://localhost/api/mcqs/mcq1/preview", {
    method: "GET",
  });
}

describe("GET /api/mcqs/:id/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 without isCorrect on choices", async () => {
    getMcqForPreview.mockResolvedValue(preview);
    const { GET } = await import("./route");
    const response = await GET(getRequest(), context);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(getMcqForPreview).toHaveBeenCalledWith("mcq1");
    expect(json.choices[0]).not.toHaveProperty("isCorrect");
    expect(json).toEqual(preview);
  });

  it("returns 404 when the question is missing", async () => {
    getMcqForPreview.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(getRequest(), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Question not found" });
  });

  it("returns 500 when getMcqForPreview throws", async () => {
    getMcqForPreview.mockRejectedValue(new Error("d1 down"));
    const { GET } = await import("./route");
    const response = await GET(getRequest(), context);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });
});
