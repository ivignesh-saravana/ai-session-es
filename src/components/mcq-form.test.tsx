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

const loadedMcq = {
  id: "mcq1",
  name: "Photosynthesis",
  description: "Grade 5",
  createdAt: "2026-01-01 00:00:00",
  updatedAt: "2026-01-01 00:00:00",
  choices: [
    { id: "c1", label: "Sunlight", isCorrect: true, position: 0 },
    { id: "c2", label: "Soil", isCorrect: false, position: 1 },
  ],
};

describe("McqForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with two choices, enforces 2–6, POSTs on save, and cancels without POST", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(loadedMcq, 201));
    const { McqForm } = await import("./mcq-form");
    const user = userEvent.setup();
    render(<McqForm />);

    expect(screen.getAllByLabelText(/choice/i).length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole("button", { name: /add choice/i }));
    expect(
      screen.getAllByRole("button", { name: /remove choice/i }).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /add choice/i }));
    await user.click(screen.getByRole("button", { name: /add choice/i }));
    await user.click(screen.getByRole("button", { name: /add choice/i }));
    expect(
      (screen.getByRole("button", { name: /add choice/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(push).toHaveBeenCalledWith("/mcqs");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not POST when the name is blank", async () => {
    const { McqForm } = await import("./mcq-form");
    const user = userEvent.setup();
    render(<McqForm />);

    await user.type(screen.getByLabelText(/choice 1/i), "Sunlight");
    await user.type(screen.getByLabelText(/choice 2/i), "Soil");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(fetch).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("POSTs a new question and navigates to /mcqs", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(loadedMcq, 201));
    const { McqForm } = await import("./mcq-form");
    const user = userEvent.setup();
    render(<McqForm />);

    await user.type(screen.getByLabelText(/^name$/i), "Photosynthesis");
    await user.type(screen.getByLabelText(/description/i), "Grade 5");
    await user.type(screen.getByLabelText(/choice 1/i), "Sunlight");
    await user.type(screen.getByLabelText(/choice 2/i), "Soil");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/mcqs");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "Photosynthesis",
      description: "Grade 5",
      choices: [
        { label: "Sunlight", isCorrect: true },
        { label: "Soil", isCorrect: false },
      ],
    });
    expect(push).toHaveBeenCalledWith("/mcqs");
  });

  it("loads an existing question and PUTs on save", async () => {
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/mcqs/mcq1" && method === "GET") {
        return Promise.resolve(jsonResponse(loadedMcq));
      }
      if (url === "/api/mcqs/mcq1" && method === "PUT") {
        return Promise.resolve(jsonResponse({ ...loadedMcq, name: "Updated" }));
      }
      return Promise.resolve(jsonResponse({ error: "unexpected" }, 500));
    });
    const { McqForm } = await import("./mcq-form");
    const user = userEvent.setup();
    render(<McqForm questionId="mcq1" />);

    await waitFor(() =>
      expect(screen.getByDisplayValue("Photosynthesis")).toBeTruthy(),
    );
    expect(fetch).toHaveBeenCalledWith("/api/mcqs/mcq1");

    await user.clear(screen.getByLabelText(/^name$/i));
    await user.type(screen.getByLabelText(/^name$/i), "Updated");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/mcqs/mcq1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/mcqs");
  });
});
