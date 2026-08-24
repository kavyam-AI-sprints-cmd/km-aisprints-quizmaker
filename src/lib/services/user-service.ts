import { getDb } from "@/lib/db";

export type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
};

export type UserWithPasswordHash = PublicUser & {
  passwordHash: string;
};

export type NewUser = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
};

export type UserUpdate = Partial<
  Pick<NewUser, "firstName" | "lastName" | "username" | "email" | "passwordHash">
>;

type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  password_hash: string;
};

export class UserConflictError extends Error {
  readonly field: "username" | "email";

  constructor(field: "username" | "email") {
    super(field === "username" ? "Username already taken" : "Email already registered");
    this.name = "UserConflictError";
    this.field = field;
  }
}

export function isUserConflictError(error: unknown): error is UserConflictError {
  return error instanceof UserConflictError;
}

export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function newUserId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeNewUser(input: NewUser): NewUser {
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    username: input.username.trim(),
    email: input.email.trim().toLowerCase(),
    passwordHash: input.passwordHash,
  };
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    username: row.username,
    email: row.email,
  };
}

function toUserWithPasswordHash(row: UserRow): UserWithPasswordHash {
  return {
    ...toPublicUser(row),
    passwordHash: row.password_hash,
  };
}

function rethrowConflict(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);

  if (/users\.username/i.test(message)) {
    throw new UserConflictError("username");
  }
  if (/users\.email/i.test(message)) {
    throw new UserConflictError("email");
  }

  throw error;
}

async function getUserRowById(id: string): Promise<UserRow | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT id, first_name, last_name, username, email, password_hash FROM users WHERE id = ?1",
    )
    .bind(id)
    .all<UserRow>();

  return results[0] ?? null;
}

export async function createUser(input: NewUser): Promise<PublicUser> {
  const user = normalizeNewUser(input);
  const id = newUserId();
  const db = await getDb();

  try {
    await db
      .prepare(
        "INSERT INTO users (id, first_name, last_name, username, email, password_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      )
      .bind(
        id,
        user.firstName,
        user.lastName,
        user.username,
        user.email,
        user.passwordHash,
      )
      .run();
  } catch (error) {
    rethrowConflict(error);
  }

  return {
    id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
  };
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const row = await getUserRowById(id);
  return row ? toPublicUser(row) : null;
}

export async function getUserByUsername(
  username: string,
): Promise<UserWithPasswordHash | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT id, first_name, last_name, username, email, password_hash FROM users WHERE username = ?1",
    )
    .bind(username)
    .all<UserRow>();

  const row = results[0];
  return row ? toUserWithPasswordHash(row) : null;
}

export async function updateUser(
  id: string,
  patch: UserUpdate,
): Promise<PublicUser | null> {
  const existing = await getUserRowById(id);
  if (!existing) {
    return null;
  }

  const next = {
    firstName: patch.firstName?.trim() ?? existing.first_name,
    lastName: patch.lastName?.trim() ?? existing.last_name,
    username: patch.username?.trim() ?? existing.username,
    email: (patch.email?.trim() ?? existing.email).toLowerCase(),
    passwordHash: patch.passwordHash ?? existing.password_hash,
  };

  const db = await getDb();

  try {
    await db
      .prepare(
        "UPDATE users SET first_name = ?1, last_name = ?2, username = ?3, email = ?4, password_hash = ?5, updated_at = CURRENT_TIMESTAMP WHERE id = ?6",
      )
      .bind(
        next.firstName,
        next.lastName,
        next.username,
        next.email,
        next.passwordHash,
        id,
      )
      .run();
  } catch (error) {
    rethrowConflict(error);
  }

  return {
    id,
    firstName: next.firstName,
    lastName: next.lastName,
    username: next.username,
    email: next.email,
  };
}

export async function deleteUser(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .prepare("DELETE FROM users WHERE id = ?1")
    .bind(id)
    .run();

  return (result.meta.changes ?? 0) > 0;
}
