import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McqStub } from "@/components/auth/mcq-stub";

const { mockPush, fetchMock } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("McqStub", () => {
  beforeEach(() => {
    mockPush.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows question-bank stub copy", () => {
    render(<McqStub />);

    expect(screen.getByRole("heading", { name: /question bank/i })).toBeTruthy();
    expect(screen.getByText(/later sprint/i)).toBeTruthy();
  });

  it("logout POSTs /api/auth/logout then goes to /login", async () => {
    const user = userEvent.setup({ delay: null });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<McqStub />);

    await user.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/logout");
    expect(init).toMatchObject({ method: "POST" });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/login"));
  });

  it("does not render an MCQ editor", () => {
    render(<McqStub />);

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByLabelText(/question/i)).toBeNull();
    expect(screen.queryByLabelText(/choice/i)).toBeNull();
  });
});
