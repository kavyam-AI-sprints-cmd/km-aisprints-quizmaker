import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { getUserByUsername, hashesEqual } from "@/lib/services/user-service";

vi.mock("@/lib/services/user-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/user-service")>();
  return {
    ...actual,
    createUser: vi.fn(),
    getUserByUsername: vi.fn(),
  };
});

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const storedUser = {
  id: "user-1",
  firstName: "Jane",
  lastName: "Doe",
  username: "jdoe",
  email: "jdoe@school.edu",
  passwordHash: HASH_A,
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and a public user on digest match", async () => {
    vi.mocked(getUserByUsername).mockResolvedValue(storedUser);

    const response = await POST(
      jsonRequest({ username: "jdoe", password: HASH_A }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.user).toEqual({
      id: "user-1",
      firstName: "Jane",
      lastName: "Doe",
      username: "jdoe",
      email: "jdoe@school.edu",
    });
    expect(payload.user).not.toHaveProperty("password");
    expect(payload.user).not.toHaveProperty("passwordHash");
    expect(hashesEqual(HASH_A, HASH_A)).toBe(true);
  });

  it("does not set cookies", async () => {
    vi.mocked(getUserByUsername).mockResolvedValue(storedUser);

    const response = await POST(
      jsonRequest({ username: "jdoe", password: HASH_A }),
    );

    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 401 for unknown username", async () => {
    vi.mocked(getUserByUsername).mockResolvedValue(null);

    const response = await POST(
      jsonRequest({ username: "missing", password: HASH_A }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: "Invalid username or password" });
  });

  it("returns 401 for wrong digest", async () => {
    vi.mocked(getUserByUsername).mockResolvedValue(storedUser);

    const response = await POST(
      jsonRequest({ username: "jdoe", password: HASH_B }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: "Invalid username or password" });
  });

  it("returns 400 on invalid body", async () => {
    const response = await POST(jsonRequest({ username: "jdoe" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: expect.any(String) });
    expect(getUserByUsername).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected service failure", async () => {
    vi.mocked(getUserByUsername).mockRejectedValue(new Error("d1 unavailable"));

    const response = await POST(
      jsonRequest({ username: "jdoe", password: HASH_A }),
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Unable to login" });
  });
});
