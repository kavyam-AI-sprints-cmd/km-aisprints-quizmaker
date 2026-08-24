import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createUser, UserConflictError } from "@/lib/services/user-service";

vi.mock("@/lib/services/user-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/user-service")>();
  return {
    ...actual,
    createUser: vi.fn(),
    getUserByUsername: vi.fn(),
  };
});

const HASH = "a".repeat(64);

const registerBody = {
  firstName: "Jane",
  lastName: "Doe",
  username: "jdoe",
  email: "jdoe@school.edu",
  password: HASH,
};

const publicUser = {
  id: "user-1",
  firstName: "Jane",
  lastName: "Doe",
  username: "jdoe",
  email: "jdoe@school.edu",
};

function jsonRequest(body: unknown, raw?: string) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 and a public user", async () => {
    vi.mocked(createUser).mockResolvedValue(publicUser);

    const response = await POST(jsonRequest(registerBody));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.user).toEqual(publicUser);
    expect(payload.user).not.toHaveProperty("password");
    expect(payload.user).not.toHaveProperty("passwordHash");
    expect(createUser).toHaveBeenCalledWith({
      firstName: "Jane",
      lastName: "Doe",
      username: "jdoe",
      email: "jdoe@school.edu",
      passwordHash: HASH,
    });
  });

  it("does not set cookies", async () => {
    vi.mocked(createUser).mockResolvedValue(publicUser);

    const response = await POST(jsonRequest(registerBody));

    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 400 on invalid JSON or invalid body", async () => {
    const invalidJson = await POST(jsonRequest(null, "{"));
    expect(invalidJson.status).toBe(400);

    const invalidBody = await POST(jsonRequest({ username: "jdoe" }));
    const payload = await invalidBody.json();
    expect(invalidBody.status).toBe(400);
    expect(payload).toEqual({ error: expect.any(String) });
  });

  it("returns 409 when username is taken", async () => {
    vi.mocked(createUser).mockRejectedValue(new UserConflictError("username"));

    const response = await POST(jsonRequest(registerBody));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({ error: "Username already taken" });
  });

  it("returns 409 when email is taken", async () => {
    vi.mocked(createUser).mockRejectedValue(new UserConflictError("email"));

    const response = await POST(jsonRequest(registerBody));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({ error: "Email already registered" });
  });

  it("returns 500 when the service throws unexpectedly", async () => {
    vi.mocked(createUser).mockRejectedValue(new Error("d1 unavailable"));

    const response = await POST(jsonRequest(registerBody));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Unable to register" });
  });
});
