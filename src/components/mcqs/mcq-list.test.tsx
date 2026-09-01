import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McqList } from "@/components/mcqs/mcq-list";

const { mockPush, fetchMock } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const TEACHER_ID = "a".repeat(32);

const listedMcq = {
  id: "mcq-1",
  name: "Arithmetic",
  question: "What is 2 + 2?",
  createdByUserId: TEACHER_ID,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setupUser() {
  return userEvent.setup({ delay: null });
}

describe("McqList", () => {
  beforeEach(() => {
    mockPush.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({ mcqs: [listedMcq] }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows question-bank heading, Create MCQ, and Log out", async () => {
    render(<McqList />);

    expect(screen.getByRole("heading", { name: /question bank/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /create mcq/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /log out/i })).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("renders name and question in the table", async () => {
    render(<McqList />);

    const row = await screen.findByRole("row", { name: /arithmetic/i });
    expect(within(row).getByText("Arithmetic")).toBeTruthy();
    expect(within(row).getByText("What is 2 + 2?")).toBeTruthy();
  });

  it("shows empty state when there are no mcqs", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ mcqs: [] }));
    render(<McqList />);

    expect(await screen.findByText(/no questions yet/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /create mcq/i })).toBeTruthy();
    expect(screen.queryByRole("row", { name: /arithmetic/i })).toBeNull();
  });

  it("Create MCQ navigates to /mcqs/new", async () => {
    const user = setupUser();
    render(<McqList />);
    await screen.findByRole("button", { name: /create mcq/i });

    await user.click(screen.getByRole("button", { name: /create mcq/i }));

    expect(mockPush).toHaveBeenCalledWith("/mcqs/new");
  });

  it("actions menu offers Edit, Preview, and Delete", async () => {
    const user = setupUser();
    render(<McqList />);

    await user.click(await screen.findByRole("button", { name: /actions for arithmetic/i }));

    expect(await screen.findByRole("menuitem", { name: /edit/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /preview/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /delete/i })).toBeTruthy();
  });

  it("Edit navigates to the edit page", async () => {
    const user = setupUser();
    render(<McqList />);

    await user.click(await screen.findByRole("button", { name: /actions for arithmetic/i }));
    await user.click(await screen.findByRole("menuitem", { name: /edit/i }));

    expect(mockPush).toHaveBeenCalledWith("/mcqs/mcq-1/edit");
  });

  it("Preview navigates to the preview page", async () => {
    const user = setupUser();
    render(<McqList />);

    await user.click(await screen.findByRole("button", { name: /actions for arithmetic/i }));
    await user.click(await screen.findByRole("menuitem", { name: /preview/i }));

    expect(mockPush).toHaveBeenCalledWith("/mcqs/mcq-1/preview");
  });

  it("Delete confirms then DELETEs and removes the row", async () => {
    const user = setupUser();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/mcqs/mcq-1" && init?.method === "DELETE") {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(jsonResponse({ mcqs: [listedMcq] }));
    });

    render(<McqList />);
    expect(await screen.findByRole("row", { name: /arithmetic/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /actions for arithmetic/i }));
    await user.click(await screen.findByRole("menuitem", { name: /delete/i }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === "/api/mcqs/mcq-1" && init?.method === "DELETE",
      );
      expect(deleteCall).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.queryByRole("row", { name: /arithmetic/i })).toBeNull();
    });
  });

  it("logout POSTs /api/auth/logout then goes to /login", async () => {
    const user = setupUser();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/auth/logout" && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(jsonResponse({ mcqs: [listedMcq] }));
    });

    render(<McqList />);
    await user.click(await screen.findByRole("button", { name: /log out/i }));

    await waitFor(() => {
      const logoutCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === "/api/auth/logout" && init?.method === "POST",
      );
      expect(logoutCall).toBeTruthy();
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/login"));
  });
});
