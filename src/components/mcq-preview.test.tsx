import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const preview = {
  id: "mcq1",
  name: "Photosynthesis",
  description: "Grade 5",
  choices: [
    { id: "c1", label: "Sunlight", position: 0 },
    { id: "c2", label: "Soil", position: 1 },
  ],
};

describe("McqPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads preview without isCorrect, submits a choice, and shows the result", async () => {
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/mcqs/mcq1/preview" && method === "GET") {
        return Promise.resolve(jsonResponse(preview));
      }
      if (url === "/api/mcqs/mcq1/attempts" && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              id: "att1",
              mcqId: "mcq1",
              selectedChoiceId: "c1",
              choiceLabel: "Sunlight",
              isCorrect: true,
              createdAt: "2026-01-01 00:00:00",
            },
            201,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ error: "unexpected" }, 500));
    });
    const { McqPreview } = await import("./mcq-preview");
    const user = userEvent.setup();
    render(<McqPreview questionId="mcq1" />);

    await waitFor(() =>
      expect(screen.getByText("Photosynthesis")).toBeTruthy(),
    );
    expect(fetch).toHaveBeenCalledWith("/api/mcqs/mcq1/preview");
    expect(screen.getByLabelText("Sunlight")).toBeTruthy();
    expect(screen.queryByText(/correct/i)).toBeNull();

    await user.click(screen.getByLabelText("Sunlight"));
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/mcqs/mcq1/attempts",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const attemptCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes("/attempts"));
    expect(JSON.parse(String(attemptCall?.[1]?.body))).toEqual({
      choiceId: "c1",
    });
    expect(screen.getByText(/correct/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
  });

  it("goes back to the question bank", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(preview));
    const { McqPreview } = await import("./mcq-preview");
    const user = userEvent.setup();
    render(<McqPreview questionId="mcq1" />);

    await waitFor(() =>
      expect(screen.getByText("Photosynthesis")).toBeTruthy(),
    );
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(push).toHaveBeenCalledWith("/mcqs");
  });
});
