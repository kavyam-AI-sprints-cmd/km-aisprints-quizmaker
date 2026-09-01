import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McqPreview } from "@/components/mcqs/mcq-preview";

const { mockPush, fetchMock } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const TEACHER_ID = "a".repeat(32);

const previewMcq = {
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

describe("McqPreview", () => {
  beforeEach(() => {
    mockPush.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({ mcq: previewMcq }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the question and its choices", async () => {
    render(<McqPreview mcqId="mcq-1" />);

    expect(await screen.findByRole("heading", { name: /arithmetic/i })).toBeTruthy();
    expect(screen.getByText("What is 2 + 2?")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^3$/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^4$/ })).toBeTruthy();
    expect(screen.queryByText(/correct/i)).toBeNull();
  });

  it("does not record an attempt when no choice is selected", async () => {
    const user = setupUser();
    render(<McqPreview mcqId="mcq-1" />);
    await screen.findByRole("heading", { name: /arithmetic/i });

    await user.click(screen.getByRole("button", { name: /check answer/i }));

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url).includes("/attempts") && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("POSTs an attempt and shows correct", async () => {
    const user = setupUser();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/mcqs/mcq-1/attempts" && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              attempt: {
                id: "a1",
                mcqId: "mcq-1",
                choiceId: "c2",
                isCorrect: true,
                createdAt: "2026-09-01T00:00:00.000Z",
              },
            },
            201,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ mcq: previewMcq }));
    });

    render(<McqPreview mcqId="mcq-1" />);
    await user.click(await screen.findByRole("radio", { name: /^4$/ }));
    await user.click(screen.getByRole("button", { name: /check answer/i }));

    await waitFor(() => {
      const attemptCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === "/api/mcqs/mcq-1/attempts" && init?.method === "POST",
      );
      expect(attemptCall).toBeTruthy();
      expect(JSON.parse(String(attemptCall?.[1]?.body))).toEqual({ choiceId: "c2" });
    });
    expect(await screen.findByText(/correct/i)).toBeTruthy();
  });

  it("POSTs an attempt and shows incorrect", async () => {
    const user = setupUser();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/mcqs/mcq-1/attempts" && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              attempt: {
                id: "a1",
                mcqId: "mcq-1",
                choiceId: "c1",
                isCorrect: false,
                createdAt: "2026-09-01T00:00:00.000Z",
              },
            },
            201,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ mcq: previewMcq }));
    });

    render(<McqPreview mcqId="mcq-1" />);
    await user.click(await screen.findByRole("radio", { name: /^3$/ }));
    await user.click(screen.getByRole("button", { name: /check answer/i }));

    expect(await screen.findByText(/incorrect/i)).toBeTruthy();
  });

  it("Back navigates to /mcqs without recording", async () => {
    const user = setupUser();
    render(<McqPreview mcqId="mcq-1" />);
    await screen.findByRole("heading", { name: /arithmetic/i });

    await user.click(screen.getByRole("button", { name: /^back$/i }));

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url).includes("/attempts") && init?.method === "POST",
      ),
    ).toBe(false);
    expect(mockPush).toHaveBeenCalledWith("/mcqs");
  });
});
