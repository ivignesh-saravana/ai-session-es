import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const questions = [
  {
    id: "mcq1",
    name: "Photosynthesis",
    description: "Grade 5 science",
    createdAt: "2026-01-01 00:00:00",
    updatedAt: "2026-01-01 00:00:00",
  },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("McqList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows table headers, rows from GET /api/mcqs, and navigates to create", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ mcqs: questions }));
    const { McqList } = await import("./mcq-list");
    const user = userEvent.setup();
    render(<McqList />);

    await waitFor(() =>
      expect(screen.getByText("Photosynthesis")).toBeTruthy(),
    );
    expect(fetch).toHaveBeenCalledWith("/api/mcqs");
    expect(screen.getByRole("columnheader", { name: /name/i })).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: /description/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: /actions/i }),
    ).toBeTruthy();
    expect(screen.getByText("Grade 5 science")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: /create question/i }),
    );
    expect(push).toHaveBeenCalledWith("/mcqs/new");
  });

  it("shows an empty state and still offers create", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ mcqs: [] }));
    const { McqList } = await import("./mcq-list");
    render(<McqList />);

    await waitFor(() =>
      expect(screen.getByText(/no questions yet/i)).toBeTruthy(),
    );
    expect(
      screen.getByRole("button", { name: /create question/i }),
    ).toBeTruthy();
  });

  it("navigates to edit from the row actions menu", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ mcqs: questions }));
    const { McqList } = await import("./mcq-list");
    const user = userEvent.setup();
    render(<McqList />);

    await waitFor(() =>
      expect(screen.getByText("Photosynthesis")).toBeTruthy(),
    );

    await user.click(screen.getByRole("button", { name: /actions/i }));
    await user.click(await screen.findByRole("menuitem", { name: /edit/i }));
    expect(push).toHaveBeenCalledWith("/mcqs/mcq1/edit");
  });

  it("deletes a question after confirming in the dialog", async () => {
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/mcqs" && method === "GET") {
        return Promise.resolve(jsonResponse({ mcqs: questions }));
      }
      if (url === "/api/mcqs/mcq1" && method === "DELETE") {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(jsonResponse({ error: "unexpected" }, 500));
    });
    const { McqList } = await import("./mcq-list");
    const user = userEvent.setup();
    render(<McqList />);

    await waitFor(() =>
      expect(screen.getByText("Photosynthesis")).toBeTruthy(),
    );

    await user.click(screen.getByRole("button", { name: /actions/i }));
    await user.click(await screen.findByRole("menuitem", { name: /delete/i }));

    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: /delete question/i }),
    );

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/mcqs/mcq1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    const listCalls = vi
      .mocked(fetch)
      .mock.calls.filter(
        ([url, init]) =>
          String(url) === "/api/mcqs" && (init?.method ?? "GET") === "GET",
      );
    expect(listCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("logs out to /login", async () => {
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input);
      if (url === "/api/auth/logout") {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(jsonResponse({ mcqs: [] }));
    });
    const { McqList } = await import("./mcq-list");
    const user = userEvent.setup();
    render(<McqList />);

    await user.click(screen.getByRole("button", { name: /log out/i }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/logout",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/login");
  });
});
