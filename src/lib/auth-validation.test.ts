import { describe, expect, it } from "vitest";
import { validateLoginBody, validateRegisterBody } from "@/lib/auth-validation";

const HASH = "a".repeat(64);

const validRegister = {
  firstName: "Jane",
  lastName: "Doe",
  username: "jdoe",
  email: "Jane@School.edu",
  password: HASH,
};

describe("auth validation", () => {
  it("register accepts a complete valid body", () => {
    const result = validateRegisterBody(validRegister);

    expect(result).toEqual({
      ok: true,
      data: {
        firstName: "Jane",
        lastName: "Doe",
        username: "jdoe",
        email: "jane@school.edu",
        password: HASH,
      },
    });
  });

  it("register rejects missing fields", () => {
    for (const field of ["firstName", "lastName", "username", "email", "password"] as const) {
      const body = { ...validRegister };
      delete body[field];
      const result = validateRegisterBody(body);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.length).toBeGreaterThan(0);
      }
    }
  });

  it("register rejects an invalid email", () => {
    const result = validateRegisterBody({
      ...validRegister,
      email: "not-an-email",
    });

    expect(result.ok).toBe(false);
  });

  it("register rejects a password that is not 64 lowercase hex", () => {
    expect(validateRegisterBody({ ...validRegister, password: "secret123" }).ok).toBe(false);
    expect(validateRegisterBody({ ...validRegister, password: "A".repeat(64) }).ok).toBe(false);
    expect(validateRegisterBody({ ...validRegister, password: "a".repeat(63) }).ok).toBe(false);
  });

  it("login accepts username plus 64-hex password", () => {
    const result = validateLoginBody({
      username: "jdoe",
      password: HASH,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        username: "jdoe",
        password: HASH,
      },
    });
  });

  it("login rejects missing username or password", () => {
    expect(validateLoginBody({ password: HASH }).ok).toBe(false);
    expect(validateLoginBody({ username: "jdoe" }).ok).toBe(false);
    expect(validateLoginBody({}).ok).toBe(false);
  });

  it("login rejects a non-hex password", () => {
    expect(validateLoginBody({ username: "jdoe", password: "secret123" }).ok).toBe(false);
    expect(validateLoginBody({ username: "jdoe", password: "A".repeat(64) }).ok).toBe(false);
  });
});
