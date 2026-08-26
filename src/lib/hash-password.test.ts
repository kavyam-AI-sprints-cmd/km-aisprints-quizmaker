import { describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/hash-password";

const PASSWORD_DIGEST =
  "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8";

describe("hashPassword", () => {
  it("returns 64 lowercase hex characters", async () => {
    const digest = await hashPassword("password");

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes UTF-8 SHA-256 for a known input", async () => {
    await expect(hashPassword("password")).resolves.toBe(PASSWORD_DIGEST);
  });

  it("different passwords produce different digests", async () => {
    const a = await hashPassword("password");
    const b = await hashPassword("password1");

    expect(a).not.toBe(b);
  });

  it("does not return the plaintext", async () => {
    const digest = await hashPassword("password");

    expect(digest).not.toBe("password");
  });
});
