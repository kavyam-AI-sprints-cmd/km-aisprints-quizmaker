import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McqForm } from "@/components/mcqs/mcq-form";

const { mockPush, fetchMock } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const TEACHER_ID = "a".repeat(32);

const createdMcq = {
  id: "mcq-1",
  name: "Arithmetic",
  question: "What is 2 + 2?",
  createdByUserId: TEACHER_ID,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  choices: [
    { id: "c1", mcqId: "mcq-1", text: "3", isCorrect: false, position: 0 },
    { id: "c2", mcqId: "mcq-1", text: "4", isCorrect: true, position: 1 },
  ],
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

async function fillCreateForm(
  user: ReturnType<typeof setupUser>,
  overrides?: { name?: string; question?: string },
) {
  if (overrides?.name !== "") {
    await user.type(screen.getByLabelText(/^name$/i), overrides?.name ?? "Arithmetic");
  }
  if (overrides?.question !== "") {
    await user.type(screen.getByLabelText(/^question$/i), overrides?.question ?? "What is 2 + 2?");
  }
  await user.type(screen.getByRole("textbox", { name: /choice 1/i }), "3");
  await user.type(screen.getByRole("textbox", { name: /choice 2/i }), "4");
  await user.click(screen.getByRole("radio", { name: /choice 2 is correct/i }));
}

describe("McqForm", () => {
  beforeEach(() => {
    mockPush.mockReset();
    fetchMock.mockReset();
    sessionStorage.clear();
    sessionStorage.setItem("quizmaker.currentUserId", TEACHER_ID);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("create mode starts with two choice fields", () => {
    render(<McqForm mode="create" />);

    expect(screen.getByRole("textbox", { name: /choice 1/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /choice 2/i })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /choice 3/i })).toBeNull();
  });

  it("Add choice adds a field up to six", async () => {
    const user = setupUser();
    render(<McqForm mode="create" />);

    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: /add choice/i }));
    }

    expect(screen.getByRole("textbox", { name: /choice 6/i })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /choice 7/i })).toBeNull();
    expect(screen.getByRole("button", { name: /add choice/i })).toHaveProperty("disabled", true);
  });

  it("cannot remove below two choices", () => {
    render(<McqForm mode="create" />);

    expect(screen.getByRole("button", { name: /remove choice 1/i })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: /remove choice 2/i })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("Save POSTs /api/mcqs then navigates to /mcqs", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValue(jsonResponse({ mcq: createdMcq }, 201));
    render(<McqForm mode="create" />);

    await fillCreateForm(user);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/mcqs");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Arithmetic",
      question: "What is 2 + 2?",
      createdByUserId: TEACHER_ID,
      choices: [
        { text: "3", isCorrect: false },
        { text: "4", isCorrect: true },
      ],
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/mcqs"));
  });

  it("does not submit when name is empty", async () => {
    const user = setupUser();
    render(<McqForm mode="create" />);

    await fillCreateForm(user, { name: "" });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit when question is empty", async () => {
    const user = setupUser();
    render(<McqForm mode="create" />);

    await fillCreateForm(user, { question: "" });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit create when there is no remembered user id", async () => {
    sessionStorage.clear();
    const user = setupUser();
    render(<McqForm mode="create" />);

    await fillCreateForm(user);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/sign in/i);
  });

  it("Cancel navigates to /mcqs without saving", async () => {
    const user = setupUser();
    render(<McqForm mode="create" />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/mcqs");
  });

  it("edit mode prefills from GET and PUTs on Save", async () => {
    const user = setupUser();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/mcqs/mcq-1" && init?.method === "PUT") {
        return Promise.resolve(jsonResponse({ mcq: createdMcq }));
      }
      return Promise.resolve(jsonResponse({ mcq: createdMcq }));
    });

    render(<McqForm mode="edit" mcqId="mcq-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^name$/i)).toHaveProperty("value", "Arithmetic");
    });
    expect(screen.getByLabelText(/^question$/i)).toHaveProperty("value", "What is 2 + 2?");
    expect(screen.getByRole("textbox", { name: /choice 1/i })).toHaveProperty("value", "3");
    expect(screen.getByRole("textbox", { name: /choice 2/i })).toHaveProperty("value", "4");

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === "/api/mcqs/mcq-1" && init?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({
        name: "Arithmetic",
        question: "What is 2 + 2?",
        choices: [
          { id: "c1", text: "3", isCorrect: false },
          { id: "c2", text: "4", isCorrect: true },
        ],
      });
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/mcqs"));
  });
});
