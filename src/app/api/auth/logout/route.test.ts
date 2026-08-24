import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createUser, getUserByUsername } from "@/lib/services/user-service";

vi.mock("@/lib/services/user-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/user-service")>();
  return {
    ...actual,
    createUser: vi.fn(),
    getUserByUsername: vi.fn(),
  };
});

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 { ok: true }", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/logout", { method: "POST" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
  });

  it("does not call the user service", async () => {
    await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));

    expect(createUser).not.toHaveBeenCalled();
    expect(getUserByUsername).not.toHaveBeenCalled();
  });

  it("does not set cookies", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/logout", { method: "POST" }),
    );

    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
