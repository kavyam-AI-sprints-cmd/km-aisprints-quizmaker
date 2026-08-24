import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function repoPath(...parts: string[]) {
  return join(process.cwd(), ...parts);
}

function parseJsonc(text: string): Record<string, unknown> {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(stripped) as Record<string, unknown>;
}

function readWranglerConfig() {
  return parseJsonc(readFileSync(repoPath("wrangler.jsonc"), "utf8"));
}

function readMigrationSql(): string {
  const dir = repoPath("migrations");
  if (!existsSync(dir)) {
    throw new Error("migrations directory does not exist");
  }

  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error("no .sql files in migrations/");
  }

  return files.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
}

function extractCreateTableBody(sql: string, table: string): string {
  const header = sql.match(new RegExp(`CREATE TABLE\\s+${table}\\s*\\(`, "i"));
  if (!header || header.index === undefined) {
    throw new Error(`CREATE TABLE ${table} not found`);
  }

  const openIndex = header.index + header[0].length - 1;
  let depth = 0;
  for (let i = openIndex; i < sql.length; i++) {
    if (sql[i] === "(") depth += 1;
    if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        return sql.slice(openIndex + 1, i);
      }
    }
  }

  throw new Error(`CREATE TABLE ${table} has unbalanced parentheses`);
}

function splitSqlClauses(body: string): string[] {
  const clauses: string[] = [];
  let current = "";
  let depth = 0;

  for (const ch of body) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      if (current.trim()) clauses.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  if (current.trim()) clauses.push(current.trim());
  return clauses;
}

function columnName(clause: string): string | null {
  if (/^(PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY|CONSTRAINT)\b/i.test(clause)) {
    return null;
  }
  const match = clause.match(/^["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?/);
  return match?.[1] ?? null;
}

function usersTable() {
  const sql = readMigrationSql();
  const body = extractCreateTableBody(sql, "users");
  const clauses = splitSqlClauses(body);
  const columns = clauses
    .map((clause) => ({ clause, name: columnName(clause) }))
    .filter((entry): entry is { clause: string; name: string } => entry.name !== null);

  return { sql, body, clauses, columns };
}

function hasUniqueConstraint(table: ReturnType<typeof usersTable>, column: string) {
  const columnClause = table.columns.find((entry) => entry.name.toLowerCase() === column);
  if (columnClause && /\bUNIQUE\b/i.test(columnClause.clause)) {
    return true;
  }

  return table.clauses.some((clause) => {
    if (!/\bUNIQUE\b/i.test(clause)) return false;
    return new RegExp(`\\(\\s*${column}\\s*\\)`, "i").test(clause);
  });
}

describe("D1 users setup", () => {
  it("wrangler.jsonc binds D1 as DB", () => {
    const config = readWranglerConfig();
    const databases = config.d1_databases;

    expect(Array.isArray(databases)).toBe(true);
    expect(
      (databases as Array<{ binding?: string }>).some((database) => database.binding === "DB"),
    ).toBe(true);
  });

  it("migration creates a users table", () => {
    expect(readMigrationSql()).toMatch(/CREATE TABLE\s+users\b/i);
  });

  it("users has required identity columns", () => {
    const names = usersTable().columns.map((column) => column.name.toLowerCase());

    expect(names).toEqual(expect.arrayContaining([
      "id",
      "first_name",
      "last_name",
      "username",
      "email",
      "password_hash",
    ]));
  });

  it("id is a text primary key", () => {
    const id = usersTable().columns.find((column) => column.name.toLowerCase() === "id");

    expect(id).toBeDefined();
    expect(id?.clause).toMatch(/\bTEXT\b/i);
    expect(id?.clause).toMatch(/\bPRIMARY\s+KEY\b/i);
    expect(id?.clause).not.toMatch(/\bINTEGER\b/i);
    expect(id?.clause).not.toMatch(/\bAUTOINCREMENT\b/i);
  });

  it("username is unique", () => {
    expect(hasUniqueConstraint(usersTable(), "username")).toBe(true);
  });

  it("email is unique", () => {
    expect(hasUniqueConstraint(usersTable(), "email")).toBe(true);
  });

  it("password is stored only as a hash column", () => {
    const names = usersTable().columns.map((column) => column.name.toLowerCase());

    expect(names).toContain("password_hash");
    expect(names).not.toContain("password");
  });
});
