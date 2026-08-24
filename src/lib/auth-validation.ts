export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type RegisterBody = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
};

export type LoginBody = {
  username: string;
  password: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_HASH_PATTERN = /^[0-9a-f]{64}$/;

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function fail(error: string): ValidationResult<never> {
  return { ok: false, error };
}

export function validateRegisterBody(body: unknown): ValidationResult<RegisterBody> {
  if (body === null || typeof body !== "object") {
    return fail("Invalid request body");
  }

  const input = body as Record<string, unknown>;
  const firstName = asTrimmedString(input.firstName);
  const lastName = asTrimmedString(input.lastName);
  const username = asTrimmedString(input.username);
  const email = asTrimmedString(input.email)?.toLowerCase();
  const password = asTrimmedString(input.password);

  if (!firstName) return fail("First name is required");
  if (!lastName) return fail("Last name is required");
  if (!username) return fail("Username is required");
  if (!email) return fail("Email is required");
  if (!EMAIL_PATTERN.test(email)) return fail("Email is invalid");
  if (!password) return fail("Password is required");
  if (!PASSWORD_HASH_PATTERN.test(password)) {
    return fail("Password must be a SHA-256 hex digest");
  }

  return {
    ok: true,
    data: { firstName, lastName, username, email, password },
  };
}

export function validateLoginBody(body: unknown): ValidationResult<LoginBody> {
  if (body === null || typeof body !== "object") {
    return fail("Invalid request body");
  }

  const input = body as Record<string, unknown>;
  const username = asTrimmedString(input.username);
  const password = asTrimmedString(input.password);

  if (!username) return fail("Username is required");
  if (!password) return fail("Password is required");
  if (!PASSWORD_HASH_PATTERN.test(password)) {
    return fail("Password must be a SHA-256 hex digest");
  }

  return {
    ok: true,
    data: { username, password },
  };
}
