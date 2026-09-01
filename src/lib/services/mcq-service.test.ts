import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import {
  createAttempt,
  createMcq,
  deleteMcq,
  getMcqById,
  listMcqs,
  McqChoiceMismatchError,
  McqChoiceNotFoundError,
  McqNotFoundError,
  McqValidationError,
  updateMcq,
} from "@/lib/services/mcq-service";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

type Row = Record<string, string | number | null>;

function createInMemoryD1() {
  const tables: Record<string, Row[]> = {
    mcqs: [],
    mcq_choices: [],
    mcq_attempts: [],
  };
  let clock = 0;

  function nextTimestamp() {
    clock += 1;
    return new Date(Date.UTC(2026, 7, 31, 12, 0, clock)).toISOString();
  }

  function bindValue(params: unknown[], placeholder: string) {
    const index = Number(placeholder.replace("?", "")) - 1;
    return params[index];
  }

  function tableFromSql(sql: string) {
    const insert = sql.match(/INSERT INTO\s+(\w+)/i);
    if (insert) return insert[1];
    const update = sql.match(/UPDATE\s+(\w+)/i);
    if (update) return update[1];
    const del = sql.match(/DELETE FROM\s+(\w+)/i);
    if (del) return del[1];
    const select = sql.match(/FROM\s+(\w+)/i);
    if (select) return select[1];
    throw new Error(`Cannot parse table: ${sql}`);
  }

  function rowsFor(sql: string) {
    const table = tableFromSql(sql);
    const rows = tables[table];
    if (!rows) {
      throw new Error(`Unknown table: ${table}`);
    }
    return rows;
  }

  function wherePredicate(sql: string, params: unknown[]) {
    const where = sql.match(/WHERE\s+(\w+)\s*=\s*(\?\d+)/i);
    if (!where) {
      return () => true;
    }
    const column = where[1];
    const value = String(bindValue(params, where[2]));
    return (row: Row) => String(row[column]) === value;
  }

  function applyInsert(sql: string, params: unknown[]) {
    const columnMatch = sql.match(/INSERT INTO\s+\w+\s*\(([^)]+)\)/i);
    if (!columnMatch) {
      throw new Error(`Unsupported INSERT: ${sql}`);
    }
    const columns = columnMatch[1].split(",").map((column) => column.trim());
    const valueMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
    if (!valueMatch) {
      throw new Error(`Unsupported INSERT values: ${sql}`);
    }
    const placeholders = valueMatch[1].split(",").map((value) => value.trim());
    const record: Row = {};
    columns.forEach((column, index) => {
      const raw = bindValue(params, placeholders[index]);
      if (raw === null || raw === undefined) {
        record[column] = null;
      } else if (typeof raw === "number") {
        record[column] = raw;
      } else {
        record[column] = String(raw);
      }
    });
    const now = nextTimestamp();
    if (record.created_at == null) record.created_at = now;
    if (record.updated_at == null && tableFromSql(sql) !== "mcq_attempts") {
      record.updated_at = now;
    }
    rowsFor(sql).push(record);
    return 1;
  }

  function applyUpdate(sql: string, params: unknown[]) {
    const rows = rowsFor(sql).filter(wherePredicate(sql, params));
    if (rows.length === 0) {
      return 0;
    }
    const setMatch = sql.match(/SET\s+(.+)\s+WHERE/i);
    if (!setMatch) {
      throw new Error(`Unsupported UPDATE: ${sql}`);
    }
    const assignments = setMatch[1].split(",").map((part) => part.trim());
    for (const row of rows) {
      for (const assignment of assignments) {
        const [columnRaw, placeholder] = assignment.split("=").map((part) => part.trim());
        const column = columnRaw.toLowerCase();
        if (column === "updated_at" && placeholder.toUpperCase() === "CURRENT_TIMESTAMP") {
          row.updated_at = nextTimestamp();
          continue;
        }
        const raw = bindValue(params, placeholder);
        if (raw === null || raw === undefined) {
          row[column] = null;
        } else if (typeof raw === "number") {
          row[column] = raw;
        } else {
          row[column] = String(raw);
        }
      }
    }
    return rows.length;
  }

  function applyDelete(sql: string, params: unknown[]) {
    const table = rowsFor(sql);
    const predicate = wherePredicate(sql, params);
    const remaining = table.filter((row) => !predicate(row));
    const changes = table.length - remaining.length;
    table.splice(0, table.length, ...remaining);
    return changes;
  }

  function applySelect(sql: string, params: unknown[]) {
    let rows = rowsFor(sql).filter(wherePredicate(sql, params));
    const order = sql.match(/ORDER BY\s+(\w+)\s*(ASC|DESC)?/i);
    if (order) {
      const column = order[1];
      const direction = (order[2] ?? "ASC").toUpperCase();
      rows = [...rows].sort((a, b) => {
        const left = String(a[column] ?? "");
        const right = String(b[column] ?? "");
        if (left === right) return 0;
        const compared = left < right ? -1 : 1;
        return direction === "DESC" ? -compared : compared;
      });
    }
    return rows;
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
          return { results: applySelect(sql, params) };
        },
      };
      return statement;
    },
  };
}

const TEACHER_ID = "a".repeat(32);

const arithmetic = {
  name: "Arithmetic",
  question: "What is 2 + 2?",
  createdByUserId: TEACHER_ID,
  choices: [
    { text: "3", isCorrect: false },
    { text: "4", isCorrect: true },
  ],
};

describe("mcq service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(createInMemoryD1() as never);
  });

  it("createMcq returns the mcq with choices and generated ids", async () => {
    const mcq = await createMcq(arithmetic);

    expect(mcq.id).toEqual(expect.any(String));
    expect(mcq.name).toBe("Arithmetic");
    expect(mcq.question).toBe("What is 2 + 2?");
    expect(mcq.createdByUserId).toBe(TEACHER_ID);
    expect(mcq.choices).toHaveLength(2);
    expect(mcq.choices[0]).toMatchObject({
      mcqId: mcq.id,
      text: "3",
      isCorrect: false,
      position: 0,
    });
    expect(mcq.choices[1]).toMatchObject({
      mcqId: mcq.id,
      text: "4",
      isCorrect: true,
      position: 1,
    });
    expect(mcq.choices[0].id).toEqual(expect.any(String));
    expect(mcq.choices[1].id).toEqual(expect.any(String));
    expect(mcq.choices[0].id).not.toBe(mcq.choices[1].id);
  });

  it("createMcq rejects blank question", async () => {
    await expect(
      createMcq({
        ...arithmetic,
        question: "   ",
      }),
    ).rejects.toBeInstanceOf(McqValidationError);
  });

  it("createMcq rejects blank createdByUserId", async () => {
    await expect(
      createMcq({
        ...arithmetic,
        createdByUserId: "   ",
      }),
    ).rejects.toBeInstanceOf(McqValidationError);
  });

  it("createMcq rejects fewer than two choices", async () => {
    await expect(
      createMcq({
        ...arithmetic,
        choices: [{ text: "4", isCorrect: true }],
      }),
    ).rejects.toBeInstanceOf(McqValidationError);
  });

  it("createMcq rejects more than six choices", async () => {
    await expect(
      createMcq({
        ...arithmetic,
        name: "Pick one",
        choices: [
          { text: "1", isCorrect: true },
          { text: "2", isCorrect: false },
          { text: "3", isCorrect: false },
          { text: "4", isCorrect: false },
          { text: "5", isCorrect: false },
          { text: "6", isCorrect: false },
          { text: "7", isCorrect: false },
        ],
      }),
    ).rejects.toBeInstanceOf(McqValidationError);
  });

  it("createMcq rejects zero correct choices", async () => {
    await expect(
      createMcq({
        ...arithmetic,
        choices: [
          { text: "3", isCorrect: false },
          { text: "5", isCorrect: false },
        ],
      }),
    ).rejects.toBeInstanceOf(McqValidationError);
  });

  it("createMcq rejects more than one correct choice", async () => {
    await expect(
      createMcq({
        ...arithmetic,
        choices: [
          { text: "4", isCorrect: true },
          { text: "four", isCorrect: true },
        ],
      }),
    ).rejects.toBeInstanceOf(McqValidationError);
  });

  it("createMcq rejects blank name", async () => {
    await expect(
      createMcq({
        ...arithmetic,
        name: "   ",
      }),
    ).rejects.toBeInstanceOf(McqValidationError);
  });

  it("createMcq rejects blank choice text", async () => {
    await expect(
      createMcq({
        ...arithmetic,
        choices: [
          { text: "   ", isCorrect: false },
          { text: "4", isCorrect: true },
        ],
      }),
    ).rejects.toBeInstanceOf(McqValidationError);
  });

  it("listMcqs returns summaries without choices", async () => {
    await createMcq(arithmetic);
    await createMcq({
      ...arithmetic,
      name: "Capital of France?",
      question: "What is the capital of France?",
      choices: [
        { text: "Paris", isCorrect: true },
        { text: "Lyon", isCorrect: false },
      ],
    });

    const listed = await listMcqs();

    expect(listed).toHaveLength(2);
    expect(listed[0]).not.toHaveProperty("choices");
    expect(listed.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Arithmetic", "Capital of France?"]),
    );
  });

  it("listMcqs returns newest first", async () => {
    const first = await createMcq(arithmetic);
    const second = await createMcq({
      ...arithmetic,
      name: "Capital of France?",
      question: "What is the capital of France?",
      choices: [
        { text: "Paris", isCorrect: true },
        { text: "Lyon", isCorrect: false },
      ],
    });

    const listed = await listMcqs();

    expect(listed.map((item) => item.id)).toEqual([second.id, first.id]);
  });

  it("getMcqById returns the mcq with choices in position order", async () => {
    const created = await createMcq(arithmetic);
    const found = await getMcqById(created.id);

    expect(found).toMatchObject({
      id: created.id,
      name: "Arithmetic",
      question: "What is 2 + 2?",
      createdByUserId: TEACHER_ID,
    });
    expect(found?.choices.map((choice) => choice.text)).toEqual(["3", "4"]);
    expect(found?.choices.map((choice) => choice.position)).toEqual([0, 1]);
  });

  it("getMcqById returns null when missing", async () => {
    await expect(getMcqById("missing-id")).resolves.toBeNull();
  });

  it("updateMcq changes name, question, and choice text", async () => {
    const created = await createMcq(arithmetic);
    const updated = await updateMcq(created.id, {
      name: "Two plus two",
      question: "What is two plus two?",
      choices: [
        { id: created.choices[0].id, text: "5", isCorrect: false },
        { id: created.choices[1].id, text: "4", isCorrect: true },
      ],
    });

    expect(updated).toMatchObject({
      id: created.id,
      name: "Two plus two",
      question: "What is two plus two?",
      createdByUserId: TEACHER_ID,
    });
    expect(updated?.choices.map((choice) => choice.text)).toEqual(["5", "4"]);
  });

  it("updateMcq does not change createdByUserId", async () => {
    const created = await createMcq(arithmetic);
    const updated = await updateMcq(created.id, {
      name: "Two plus two",
      question: created.question,
      choices: created.choices.map((choice) => ({
        id: choice.id,
        text: choice.text,
        isCorrect: choice.isCorrect,
      })),
    });

    expect(updated?.createdByUserId).toBe(TEACHER_ID);
  });

  it("updateMcq preserves choice ids that are sent", async () => {
    const created = await createMcq(arithmetic);
    const updated = await updateMcq(created.id, {
      name: created.name,
      question: created.question,
      choices: [
        { id: created.choices[0].id, text: "3", isCorrect: false },
        { id: created.choices[1].id, text: "4", isCorrect: true },
      ],
    });

    expect(updated?.choices.map((choice) => choice.id)).toEqual([
      created.choices[0].id,
      created.choices[1].id,
    ]);
  });

  it("updateMcq inserts new choices and deletes omitted ones", async () => {
    const created = await createMcq(arithmetic);
    const keptId = created.choices[1].id;
    const omittedId = created.choices[0].id;

    const updated = await updateMcq(created.id, {
      name: created.name,
      question: created.question,
      choices: [
        { id: keptId, text: "4", isCorrect: true },
        { text: "22", isCorrect: false },
      ],
    });

    const ids = updated?.choices.map((choice) => choice.id) ?? [];
    expect(ids).toContain(keptId);
    expect(ids).not.toContain(omittedId);
    expect(updated?.choices.map((choice) => choice.text)).toEqual(["4", "22"]);
  });

  it("updateMcq returns null when missing", async () => {
    await expect(
      updateMcq("missing-id", arithmetic),
    ).resolves.toBeNull();
  });

  it("deleteMcq returns true and removes the row", async () => {
    const created = await createMcq(arithmetic);

    await expect(deleteMcq(created.id)).resolves.toBe(true);
    await expect(getMcqById(created.id)).resolves.toBeNull();
  });

  it("deleteMcq also removes choices and attempts", async () => {
    const created = await createMcq(arithmetic);
    await createAttempt(created.id, created.choices[1].id);

    await expect(deleteMcq(created.id)).resolves.toBe(true);
    await expect(getMcqById(created.id)).resolves.toBeNull();
    await expect(createAttempt(created.id, created.choices[1].id)).rejects.toBeInstanceOf(
      McqNotFoundError,
    );
  });

  it("deleteMcq returns false when missing", async () => {
    await expect(deleteMcq("missing-id")).resolves.toBe(false);
  });

  it("createAttempt records the selected choice and whether it was correct", async () => {
    const created = await createMcq(arithmetic);
    const attempt = await createAttempt(created.id, created.choices[1].id);

    expect(attempt).toMatchObject({
      mcqId: created.id,
      choiceId: created.choices[1].id,
      isCorrect: true,
    });
    expect(attempt.id).toEqual(expect.any(String));
    expect(attempt.createdAt).toEqual(expect.any(String));
  });

  it("createAttempt records an incorrect selection as incorrect", async () => {
    const created = await createMcq(arithmetic);
    const attempt = await createAttempt(created.id, created.choices[0].id);

    expect(attempt.isCorrect).toBe(false);
    expect(attempt.choiceId).toBe(created.choices[0].id);
  });

  it("createAttempt rejects a choice that does not belong to the mcq", async () => {
    const first = await createMcq(arithmetic);
    const second = await createMcq({
      ...arithmetic,
      name: "Capital of France?",
      question: "What is the capital of France?",
      choices: [
        { text: "Paris", isCorrect: true },
        { text: "Lyon", isCorrect: false },
      ],
    });

    await expect(createAttempt(first.id, second.choices[0].id)).rejects.toBeInstanceOf(
      McqChoiceMismatchError,
    );
  });

  it("createAttempt returns null (or not-found error) when the mcq is missing", async () => {
    await expect(createAttempt("missing-id", "choice-id")).rejects.toBeInstanceOf(
      McqNotFoundError,
    );
  });

  it("createAttempt rejects a missing choice", async () => {
    const created = await createMcq(arithmetic);

    await expect(createAttempt(created.id, "missing-choice")).rejects.toBeInstanceOf(
      McqChoiceNotFoundError,
    );
  });
});
