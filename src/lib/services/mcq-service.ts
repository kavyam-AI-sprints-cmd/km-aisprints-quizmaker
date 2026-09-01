import { getDb } from "@/lib/db";

export type Mcq = {
  id: string;
  name: string;
  question: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type McqChoice = {
  id: string;
  mcqId: string;
  text: string;
  isCorrect: boolean;
  position: number;
};

export type McqWithChoices = Mcq & { choices: McqChoice[] };

export type McqAttempt = {
  id: string;
  mcqId: string;
  choiceId: string;
  isCorrect: boolean;
  createdAt: string;
};

export type NewMcqChoice = {
  text: string;
  isCorrect: boolean;
};

export type NewMcq = {
  name: string;
  question: string;
  createdByUserId: string;
  choices: NewMcqChoice[];
};

export type McqChoiceUpdate = {
  id?: string;
  text: string;
  isCorrect: boolean;
};

export type McqUpdate = {
  name: string;
  question: string;
  choices: McqChoiceUpdate[];
};

type McqRow = {
  id: string;
  name: string;
  question: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type ChoiceRow = {
  id: string;
  mcq_id: string;
  text: string;
  is_correct: number | string;
  position: number | string;
};

type AttemptRow = {
  id: string;
  mcq_id: string;
  choice_id: string;
  is_correct: number | string;
  created_at: string;
};

export class McqValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McqValidationError";
  }
}

export function isMcqValidationError(error: unknown): error is McqValidationError {
  return error instanceof McqValidationError;
}

export class McqNotFoundError extends Error {
  constructor() {
    super("MCQ not found");
    this.name = "McqNotFoundError";
  }
}

export function isMcqNotFoundError(error: unknown): error is McqNotFoundError {
  return error instanceof McqNotFoundError;
}

export class McqChoiceNotFoundError extends Error {
  constructor() {
    super("Choice not found");
    this.name = "McqChoiceNotFoundError";
  }
}

export function isMcqChoiceNotFoundError(error: unknown): error is McqChoiceNotFoundError {
  return error instanceof McqChoiceNotFoundError;
}

export class McqChoiceMismatchError extends Error {
  constructor() {
    super("Choice does not belong to this MCQ");
    this.name = "McqChoiceMismatchError";
  }
}

export function isMcqChoiceMismatchError(error: unknown): error is McqChoiceMismatchError {
  return error instanceof McqChoiceMismatchError;
}

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function asBoolean(value: number | string | boolean): boolean {
  return value === 1 || value === true || value === "1";
}

function asPosition(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function normalizeName(name: string): string {
  return name.trim();
}

function normalizeQuestion(question: string): string {
  return question.trim();
}

function normalizeCreatedByUserId(userId: string): string {
  return userId.trim();
}

function normalizeChoiceText(text: string): string {
  return text.trim();
}

function assertMcqFields(
  name: string,
  question: string,
  choices: Array<{ text: string; isCorrect: boolean }>,
  createdByUserId?: string,
) {
  if (!name) {
    throw new McqValidationError("Name is required");
  }
  if (name.length > 200) {
    throw new McqValidationError("Name must be 200 characters or fewer");
  }
  if (!question) {
    throw new McqValidationError("Question is required");
  }
  if (question.length > 1000) {
    throw new McqValidationError("Question must be 1000 characters or fewer");
  }
  if (createdByUserId !== undefined && !createdByUserId) {
    throw new McqValidationError("Created by user id is required");
  }
  if (choices.length < 2) {
    throw new McqValidationError("An MCQ must have at least two choices");
  }
  if (choices.length > 6) {
    throw new McqValidationError("An MCQ cannot have more than six choices");
  }

  const correctCount = choices.filter((choice) => choice.isCorrect).length;
  if (correctCount !== 1) {
    throw new McqValidationError("Exactly one choice must be correct");
  }

  for (const choice of choices) {
    if (!choice.text) {
      throw new McqValidationError("Choice text is required");
    }
    if (choice.text.length > 500) {
      throw new McqValidationError("Choice text must be 500 characters or fewer");
    }
  }
}

function toMcq(row: McqRow): Mcq {
  return {
    id: row.id,
    name: row.name,
    question: row.question,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toChoice(row: ChoiceRow): McqChoice {
  return {
    id: row.id,
    mcqId: row.mcq_id,
    text: row.text,
    isCorrect: asBoolean(row.is_correct),
    position: asPosition(row.position),
  };
}

async function getMcqRow(id: string): Promise<McqRow | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT id, name, question, created_by_user_id, created_at, updated_at FROM mcqs WHERE id = ?1",
    )
    .bind(id)
    .all<McqRow>();

  return results[0] ?? null;
}

async function getChoicesForMcq(mcqId: string): Promise<McqChoice[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT id, mcq_id, text, is_correct, position FROM mcq_choices WHERE mcq_id = ?1 ORDER BY position ASC",
    )
    .bind(mcqId)
    .all<ChoiceRow>();

  return results.map(toChoice);
}

async function getChoiceRow(id: string): Promise<ChoiceRow | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT id, mcq_id, text, is_correct, position FROM mcq_choices WHERE id = ?1",
    )
    .bind(id)
    .all<ChoiceRow>();

  return results[0] ?? null;
}

async function insertChoice(
  mcqId: string,
  choice: { text: string; isCorrect: boolean },
  position: number,
  id = newId(),
) {
  const db = await getDb();
  await db
    .prepare(
      "INSERT INTO mcq_choices (id, mcq_id, text, is_correct, position) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(id, mcqId, choice.text, choice.isCorrect ? 1 : 0, position)
    .run();
}

export async function createMcq(input: NewMcq): Promise<McqWithChoices> {
  const name = normalizeName(input.name);
  const question = normalizeQuestion(input.question);
  const createdByUserId = normalizeCreatedByUserId(input.createdByUserId);
  const choices = input.choices.map((choice) => ({
    text: normalizeChoiceText(choice.text),
    isCorrect: choice.isCorrect,
  }));
  assertMcqFields(name, question, choices, createdByUserId);

  const id = newId();
  const db = await getDb();

  await db
    .prepare(
      "INSERT INTO mcqs (id, name, question, created_by_user_id) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(id, name, question, createdByUserId)
    .run();

  for (const [position, choice] of choices.entries()) {
    await insertChoice(id, choice, position);
  }

  const created = await getMcqById(id);
  if (!created) {
    throw new Error("Failed to load created MCQ");
  }
  return created;
}

export async function listMcqs(): Promise<Mcq[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT id, name, question, created_by_user_id, created_at, updated_at FROM mcqs ORDER BY created_at DESC",
    )
    .all<McqRow>();

  return results.map(toMcq);
}

export async function getMcqById(id: string): Promise<McqWithChoices | null> {
  const row = await getMcqRow(id);
  if (!row) {
    return null;
  }

  return {
    ...toMcq(row),
    choices: await getChoicesForMcq(id),
  };
}

export async function updateMcq(
  id: string,
  input: McqUpdate,
): Promise<McqWithChoices | null> {
  const existing = await getMcqById(id);
  if (!existing) {
    return null;
  }

  const name = normalizeName(input.name);
  const question = normalizeQuestion(input.question);
  const choices = input.choices.map((choice) => ({
    id: choice.id,
    text: normalizeChoiceText(choice.text),
    isCorrect: choice.isCorrect,
  }));
  assertMcqFields(name, question, choices);

  const db = await getDb();
  await db
    .prepare(
      "UPDATE mcqs SET name = ?1, question = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
    )
    .bind(name, question, id)
    .run();

  const incomingIds = new Set(
    choices.map((choice) => choice.id).filter((choiceId): choiceId is string => Boolean(choiceId)),
  );
  const existingById = new Map(existing.choices.map((choice) => [choice.id, choice]));

  for (const choice of existing.choices) {
    if (!incomingIds.has(choice.id)) {
      await db
        .prepare("DELETE FROM mcq_attempts WHERE choice_id = ?1")
        .bind(choice.id)
        .run();
      await db.prepare("DELETE FROM mcq_choices WHERE id = ?1").bind(choice.id).run();
    }
  }

  for (const [position, choice] of choices.entries()) {
    if (choice.id && existingById.has(choice.id)) {
      await db
        .prepare(
          "UPDATE mcq_choices SET text = ?1, is_correct = ?2, position = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?4",
        )
        .bind(choice.text, choice.isCorrect ? 1 : 0, position, choice.id)
        .run();
    } else {
      await insertChoice(id, choice, position);
    }
  }

  return getMcqById(id);
}

export async function deleteMcq(id: string): Promise<boolean> {
  const existing = await getMcqRow(id);
  if (!existing) {
    return false;
  }

  const db = await getDb();
  await db.prepare("DELETE FROM mcq_attempts WHERE mcq_id = ?1").bind(id).run();
  await db.prepare("DELETE FROM mcq_choices WHERE mcq_id = ?1").bind(id).run();
  const result = await db.prepare("DELETE FROM mcqs WHERE id = ?1").bind(id).run();

  return (result.meta.changes ?? 0) > 0;
}

export async function createAttempt(mcqId: string, choiceId: string): Promise<McqAttempt> {
  const mcq = await getMcqRow(mcqId);
  if (!mcq) {
    throw new McqNotFoundError();
  }

  const choice = await getChoiceRow(choiceId);
  if (!choice) {
    throw new McqChoiceNotFoundError();
  }
  if (choice.mcq_id !== mcqId) {
    throw new McqChoiceMismatchError();
  }

  const id = newId();
  const isCorrect = asBoolean(choice.is_correct);
  const db = await getDb();

  await db
    .prepare(
      "INSERT INTO mcq_attempts (id, mcq_id, choice_id, is_correct) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(id, mcqId, choiceId, isCorrect ? 1 : 0)
    .run();

  const { results } = await db
    .prepare(
      "SELECT id, mcq_id, choice_id, is_correct, created_at FROM mcq_attempts WHERE id = ?1",
    )
    .bind(id)
    .all<AttemptRow>();

  const row = results[0];
  if (!row) {
    throw new Error("Failed to load created attempt");
  }

  return {
    id: row.id,
    mcqId: row.mcq_id,
    choiceId: row.choice_id,
    isCorrect: asBoolean(row.is_correct),
    createdAt: row.created_at,
  };
}
