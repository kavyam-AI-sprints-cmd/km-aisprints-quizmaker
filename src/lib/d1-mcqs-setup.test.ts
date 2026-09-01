import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function repoPath(...parts: string[]) {
  return join(process.cwd(), ...parts);
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
  const headerPattern = new RegExp(`CREATE TABLE\\s+${table}\\s*\\(`, "gi");
  let header: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = headerPattern.exec(sql)) !== null) {
    header = match;
  }
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

function tableInfo(table: string) {
  const sql = readMigrationSql();
  const body = extractCreateTableBody(sql, table);
  const clauses = splitSqlClauses(body);
  const columns = clauses
    .map((clause) => ({ clause, name: columnName(clause) }))
    .filter((entry): entry is { clause: string; name: string } => entry.name !== null);

  return { sql, body, clauses, columns };
}

function hasForeignKey(
  table: ReturnType<typeof tableInfo>,
  column: string,
  references: string,
) {
  return table.clauses.some((clause) => {
    const inline =
      table.columns.find((entry) => entry.name.toLowerCase() === column)?.clause ?? "";
    if (
      new RegExp(`\\b${column}\\b`, "i").test(inline) &&
      /REFERENCES/i.test(inline) &&
      new RegExp(`\\b${references}\\b`, "i").test(inline)
    ) {
      return true;
    }

    return (
      /FOREIGN\s+KEY/i.test(clause) &&
      new RegExp(`\\(\\s*${column}\\s*\\)`, "i").test(clause) &&
      new RegExp(`REFERENCES\\s+${references}\\b`, "i").test(clause)
    );
  });
}

describe("D1 MCQ setup", () => {
  it("migration creates an mcqs table", () => {
    expect(readMigrationSql()).toMatch(/CREATE TABLE\s+mcqs\b/i);
  });

  it("mcqs has required columns", () => {
    const names = tableInfo("mcqs").columns.map((column) => column.name.toLowerCase());

    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "question",
        "created_by_user_id",
        "created_at",
        "updated_at",
      ]),
    );
    expect(names).not.toContain("description");
  });

  it("mcqs id is a text primary key", () => {
    const id = tableInfo("mcqs").columns.find((column) => column.name.toLowerCase() === "id");

    expect(id).toBeDefined();
    expect(id?.clause).toMatch(/\bTEXT\b/i);
    expect(id?.clause).toMatch(/\bPRIMARY\s+KEY\b/i);
    expect(id?.clause).not.toMatch(/\bINTEGER\b/i);
    expect(id?.clause).not.toMatch(/\bAUTOINCREMENT\b/i);
  });

  it("mcqs created_by_user_id references users", () => {
    expect(hasForeignKey(tableInfo("mcqs"), "created_by_user_id", "users")).toBe(true);
  });

  it("migration creates an mcq_choices table", () => {
    expect(readMigrationSql()).toMatch(/CREATE TABLE\s+mcq_choices\b/i);
  });

  it("mcq_choices has required columns", () => {
    const names = tableInfo("mcq_choices").columns.map((column) => column.name.toLowerCase());

    expect(names).toEqual(
      expect.arrayContaining(["id", "mcq_id", "text", "is_correct", "position"]),
    );
  });

  it("mcq_choices references mcqs", () => {
    expect(hasForeignKey(tableInfo("mcq_choices"), "mcq_id", "mcqs")).toBe(true);
  });

  it("migration creates an mcq_attempts table", () => {
    expect(readMigrationSql()).toMatch(/CREATE TABLE\s+mcq_attempts\b/i);
  });

  it("mcq_attempts has required columns", () => {
    const names = tableInfo("mcq_attempts").columns.map((column) => column.name.toLowerCase());

    expect(names).toEqual(
      expect.arrayContaining(["id", "mcq_id", "choice_id", "is_correct"]),
    );
  });

  it("mcq_attempts references mcqs and mcq_choices", () => {
    const attempts = tableInfo("mcq_attempts");

    expect(hasForeignKey(attempts, "mcq_id", "mcqs")).toBe(true);
    expect(hasForeignKey(attempts, "choice_id", "mcq_choices")).toBe(true);
  });
});
