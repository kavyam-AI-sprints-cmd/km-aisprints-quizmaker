import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import {
  createUser,
  deleteUser,
  getUserById,
  getUserByUsername,
  hashesEqual,
  updateUser,
  UserConflictError,
} from "@/lib/services/user-service";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

function createInMemoryD1() {
  const rows: UserRow[] = [];

  function bindValue(sql: string, params: unknown[], placeholder: string) {
    const index = Number(placeholder.replace("?", "")) - 1;
    return params[index];
  }

  function uniqueConflict(username: string, email: string, exceptId?: string) {
    const usernameTaken = rows.some(
      (row) => row.username === username && row.id !== exceptId,
    );
    if (usernameTaken) {
      throw new Error("UNIQUE constraint failed: users.username");
    }

    const emailTaken = rows.some(
      (row) => row.email === email && row.id !== exceptId,
    );
    if (emailTaken) {
      throw new Error("UNIQUE constraint failed: users.email");
    }
  }

  function applyInsert(sql: string, params: unknown[]) {
    const columnMatch = sql.match(/INSERT INTO users\s*\(([^)]+)\)/i);
    if (!columnMatch) {
      throw new Error(`Unsupported INSERT: ${sql}`);
    }

    const columns = columnMatch[1].split(",").map((column) => column.trim());
    const valueMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
    if (!valueMatch) {
      throw new Error(`Unsupported INSERT values: ${sql}`);
    }

    const placeholders = valueMatch[1].split(",").map((value) => value.trim());
    const record: Record<string, string> = {};
    columns.forEach((column, index) => {
      record[column] = String(bindValue(sql, params, placeholders[index]) ?? "");
    });

    const now = new Date().toISOString();
    const row: UserRow = {
      id: record.id || crypto.randomUUID().replaceAll("-", ""),
      first_name: record.first_name,
      last_name: record.last_name,
      username: record.username,
      email: record.email,
      password_hash: record.password_hash,
      created_at: record.created_at || now,
      updated_at: record.updated_at || now,
    };

    uniqueConflict(row.username, row.email);
    rows.push(row);
    return 1;
  }

  function whereRow(sql: string, params: unknown[]) {
    const whereMatch = sql.match(/WHERE\s+(id|username|email)\s*=\s*(\?\d+)/i);
    if (!whereMatch) {
      throw new Error(`Unsupported WHERE: ${sql}`);
    }

    const column = whereMatch[1].toLowerCase() as "id" | "username" | "email";
    const value = String(bindValue(sql, params, whereMatch[2]));
    return rows.find((row) => row[column] === value);
  }

  function applyUpdate(sql: string, params: unknown[]) {
    const existing = whereRow(sql, params);
    if (!existing) {
      return 0;
    }

    const setMatch = sql.match(/SET\s+(.+)\s+WHERE/i);
    if (!setMatch) {
      throw new Error(`Unsupported UPDATE: ${sql}`);
    }

    const assignments = setMatch[1].split(",").map((part) => part.trim());
    const next = { ...existing };

    for (const assignment of assignments) {
      const [columnRaw, placeholder] = assignment.split("=").map((part) => part.trim());
      const column = columnRaw.toLowerCase();
      if (column === "updated_at" && placeholder.toUpperCase() === "CURRENT_TIMESTAMP") {
        next.updated_at = new Date().toISOString();
        continue;
      }
      (next as Record<string, string>)[column] = String(
        bindValue(sql, params, placeholder),
      );
    }

    uniqueConflict(next.username, next.email, existing.id);
    Object.assign(existing, next);
    return 1;
  }

  function applyDelete(sql: string, params: unknown[]) {
    const existing = whereRow(sql, params);
    if (!existing) {
      return 0;
    }
    rows.splice(rows.indexOf(existing), 1);
    return 1;
  }

  return {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async run() {
          let changes = 0;
          if (/^INSERT/i.test(sql.trim())) {
            changes = applyInsert(sql, params);
          } else if (/^UPDATE/i.test(sql.trim())) {
            changes = applyUpdate(sql, params);
          } else if (/^DELETE/i.test(sql.trim())) {
            changes = applyDelete(sql, params);
          }
          return { success: true, meta: { changes } };
        },
        async all() {
          const row = whereRow(sql, params);
          return { results: row ? [row] : [] };
        },
      };
      return statement;
    },
  };
}

const jane = {
  firstName: "Jane",
  lastName: "Doe",
  username: "jdoe",
  email: "jdoe@school.edu",
  passwordHash: HASH_A,
};

describe("user service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(createInMemoryD1() as never);
  });

  it("createUser returns a public user without passwordHash", async () => {
    const user = await createUser(jane);

    expect(user.id).toEqual(expect.any(String));
    expect(user.firstName).toBe("Jane");
    expect(user.lastName).toBe("Doe");
    expect(user.username).toBe("jdoe");
    expect(user.email).toBe("jdoe@school.edu");
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("createUser stores the hash internally", async () => {
    await createUser(jane);
    const stored = await getUserByUsername("jdoe");

    expect(stored?.passwordHash).toBe(HASH_A);
  });

  it("createUser stores email in lowercase", async () => {
    const user = await createUser({
      ...jane,
      email: "Jane@School.edu",
    });

    expect(user.email).toBe("jane@school.edu");
  });

  it("createUser rejects a duplicate username", async () => {
    await createUser(jane);

    await expect(
      createUser({
        ...jane,
        email: "other@school.edu",
      }),
    ).rejects.toBeInstanceOf(UserConflictError);
    await expect(
      createUser({
        ...jane,
        email: "other@school.edu",
      }),
    ).rejects.toMatchObject({
      name: "UserConflictError",
      field: "username",
    });
  });

  it("createUser rejects a duplicate email", async () => {
    await createUser(jane);

    await expect(
      createUser({
        ...jane,
        username: "other",
      }),
    ).rejects.toMatchObject({
      name: "UserConflictError",
      field: "email",
    });
  });

  it("createUser allows username equal to email", async () => {
    const user = await createUser({
      ...jane,
      username: "jdoe@school.edu",
      email: "jdoe@school.edu",
    });

    expect(user.username).toBe("jdoe@school.edu");
    expect(user.email).toBe("jdoe@school.edu");
  });

  it("getUserById returns the user", async () => {
    const created = await createUser(jane);
    const found = await getUserById(created.id);

    expect(found).toEqual(created);
    expect(found).not.toHaveProperty("passwordHash");
  });

  it("getUserById returns null when missing", async () => {
    await expect(getUserById("missing-id")).resolves.toBeNull();
  });

  it("getUserByUsername includes passwordHash", async () => {
    await createUser(jane);
    const found = await getUserByUsername("jdoe");

    expect(found).toMatchObject({
      firstName: "Jane",
      username: "jdoe",
      email: "jdoe@school.edu",
      passwordHash: HASH_A,
    });
  });

  it("getUserByUsername returns null when missing", async () => {
    await expect(getUserByUsername("nobody")).resolves.toBeNull();
  });

  it("updateUser changes allowed fields", async () => {
    const created = await createUser(jane);
    const updated = await updateUser(created.id, {
      lastName: "Smith",
      email: "Jane.Smith@school.edu",
    });

    expect(updated).toMatchObject({
      id: created.id,
      firstName: "Jane",
      lastName: "Smith",
      username: "jdoe",
      email: "jane.smith@school.edu",
    });
    expect(updated).not.toHaveProperty("passwordHash");

    const stored = await getUserByUsername("jdoe");
    expect(stored?.passwordHash).toBe(HASH_A);
  });

  it("updateUser returns null when missing", async () => {
    await expect(
      updateUser("missing-id", { lastName: "Smith" }),
    ).resolves.toBeNull();
  });

  it("deleteUser returns true when a row is removed", async () => {
    const created = await createUser(jane);

    await expect(deleteUser(created.id)).resolves.toBe(true);
    await expect(getUserById(created.id)).resolves.toBeNull();
  });

  it("deleteUser returns false when missing", async () => {
    await expect(deleteUser("missing-id")).resolves.toBe(false);
  });

  it("hashesEqual is true for identical digests", () => {
    expect(hashesEqual(HASH_A, HASH_A)).toBe(true);
  });

  it("hashesEqual is false for different digests", () => {
    expect(hashesEqual(HASH_A, HASH_B)).toBe(false);
  });
});
