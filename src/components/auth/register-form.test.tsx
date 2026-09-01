import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "@/components/auth/register-form";

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

async function fillRegister(
  user: ReturnType<typeof userEvent.setup>,
  overrides?: {
    firstName?: string;
    lastName?: string;
    username?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  },
) {
  await user.type(screen.getByLabelText("First name"), overrides?.firstName ?? "Jane");
  await user.type(screen.getByLabelText("Last name"), overrides?.lastName ?? "Doe");
  await user.type(screen.getByLabelText("Username"), overrides?.username ?? "jdoe");
  await user.type(screen.getByLabelText("Email"), overrides?.email ?? "jdoe@school.edu");
  await user.type(screen.getByLabelText("Password"), overrides?.password ?? "password");
  await user.type(
    screen.getByLabelText("Confirm password"),
    overrides?.confirmPassword ?? overrides?.password ?? "password",
  );
}

describe("RegisterForm", () => {
  beforeEach(() => {
    mockPush.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders first name, last name, username, email, password, confirm password", () => {
    render(<RegisterForm />);

    expect(screen.getByLabelText("First name")).toBeTruthy();
    expect(screen.getByLabelText("Last name")).toBeTruthy();
    expect(screen.getByLabelText("Username")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm password")).toBeTruthy();
  });

  it("does not submit when required fields are empty", async () => {
    const user = setupUser();
    render(<RegisterForm />);

    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit when email is invalid", async () => {
    const user = setupUser();
    render(<RegisterForm />);

    await fillRegister(user, { email: "not-an-email" });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit when username is too short", async () => {
    const user = setupUser();
    render(<RegisterForm />);

    await fillRegister(user, { username: "ab" });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit when passwords do not match", async () => {
    const user = setupUser();
    render(<RegisterForm />);

    await fillRegister(user, { password: "password1", confirmPassword: "password2" });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit when password is shorter than 8 characters", async () => {
    const user = setupUser();
    render(<RegisterForm />);

    await fillRegister(user, { password: "short", confirmPassword: "short" });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hashes then POSTs to /api/auth/register", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ user: publicUser }), { status: 201 }),
    );
    render(<RegisterForm />);

    await fillRegister(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/register");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(init?.body))).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      username: "jdoe",
      email: "jdoe@school.edu",
      password: PASSWORD_DIGEST,
    });
  });

  it("navigates to /mcqs on 201", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ user: publicUser }), { status: 201 }),
    );
    render(<RegisterForm />);

    await fillRegister(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/mcqs"));
  });

  it("shows a conflict error on 409", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Username already taken" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<RegisterForm />);

    await fillRegister(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/username already taken/i);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
