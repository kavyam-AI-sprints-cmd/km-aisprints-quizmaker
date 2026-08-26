import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/login-form";

const { mockPush, fetchMock } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const PASSWORD_DIGEST =
  "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8";

const publicUser = {
  id: "user-1",
  firstName: "Jane",
  lastName: "Doe",
  username: "jdoe",
  email: "jdoe@school.edu",
};

function setupUser() {
  return userEvent.setup({ delay: null });
}

describe("LoginForm", () => {
  beforeEach(() => {
    mockPush.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders username and password fields and a submit control", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("Username")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: /login/i })).toBeTruthy();
  });

  it("password input is masked", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("Password")).toHaveProperty("type", "password");
  });

  it("does not submit when username is empty", async () => {
    const user = setupUser();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: /login/i }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit when password is shorter than 8 characters", async () => {
    const user = setupUser();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Username"), "jdoe");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: /login/i }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hashes then POSTs to /api/auth/login", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ user: publicUser }), { status: 200 }),
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Username"), "jdoe");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/login");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(init?.body))).toEqual({
      username: "jdoe",
      password: PASSWORD_DIGEST,
    });
  });

  it("navigates to /mcqs on 200", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ user: publicUser }), { status: 200 }),
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Username"), "jdoe");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/mcqs"));
  });

  it("shows an error on 401 and does not navigate", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid username or password" }), {
        status: 401,
      }),
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Username"), "jdoe");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: /login/i }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/invalid username or password/i);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
