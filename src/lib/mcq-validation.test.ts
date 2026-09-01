import { describe, expect, it } from "vitest";
import {
  validateAttemptBody,
  validateCreateMcqBody,
  validateUpdateMcqBody,
} from "@/lib/mcq-validation";

const TEACHER_ID = "a".repeat(32);

const validChoices = [
  { text: "3", isCorrect: false },
  { text: "4", isCorrect: true },
];

const validCreate = {
  name: "Arithmetic",
  question: "What is 2 + 2?",
  createdByUserId: TEACHER_ID,
  choices: validChoices,
};

describe("mcq validation", () => {
  it("accepts a valid create/update body", () => {
    const created = validateCreateMcqBody({
      ...validCreate,
      name: "  Arithmetic  ",
      question: "  What is 2 + 2?  ",
    });
    expect(created).toEqual({
      ok: true,
      data: {
        name: "Arithmetic",
        question: "What is 2 + 2?",
        createdByUserId: TEACHER_ID,
        choices: validChoices,
      },
    });

    const updated = validateUpdateMcqBody({
      name: "Two plus two",
      question: "What is two plus two?",
      choices: [
        { id: "choice-1", text: "3", isCorrect: false },
        { text: "4", isCorrect: true },
      ],
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.data.question).toBe("What is two plus two?");
      expect(updated.data.choices[0].id).toBe("choice-1");
    }
  });

  it("rejects missing name", () => {
    expect(validateCreateMcqBody({ ...validCreate, name: "   " }).ok).toBe(false);
    expect(validateUpdateMcqBody({ question: "Q", choices: validChoices }).ok).toBe(false);
  });

  it("rejects missing question", () => {
    expect(validateCreateMcqBody({ ...validCreate, question: "" }).ok).toBe(false);
    expect(validateUpdateMcqBody({ name: "N", choices: validChoices }).ok).toBe(false);
  });

  it("rejects missing createdByUserId on create", () => {
    const result = validateCreateMcqBody({
      name: "Arithmetic",
      question: "What is 2 + 2?",
      choices: validChoices,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.toLowerCase()).toContain("user");
    }
  });

  it("rejects fewer than two choices", () => {
    const result = validateCreateMcqBody({
      ...validCreate,
      choices: [{ text: "4", isCorrect: true }],
    });

    expect(result.ok).toBe(false);
  });

  it("rejects more than six choices", () => {
    const result = validateCreateMcqBody({
      ...validCreate,
      choices: [
        { text: "1", isCorrect: true },
        { text: "2", isCorrect: false },
        { text: "3", isCorrect: false },
        { text: "4", isCorrect: false },
        { text: "5", isCorrect: false },
        { text: "6", isCorrect: false },
        { text: "7", isCorrect: false },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it("rejects when no choice is correct", () => {
    const result = validateCreateMcqBody({
      ...validCreate,
      choices: [
        { text: "3", isCorrect: false },
        { text: "5", isCorrect: false },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it("rejects when two choices are correct", () => {
    const result = validateCreateMcqBody({
      ...validCreate,
      choices: [
        { text: "4", isCorrect: true },
        { text: "four", isCorrect: true },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it("rejects blank choice text", () => {
    const result = validateCreateMcqBody({
      ...validCreate,
      choices: [
        { text: "   ", isCorrect: false },
        { text: "4", isCorrect: true },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it("attempt body requires choiceId", () => {
    expect(validateAttemptBody({}).ok).toBe(false);
    expect(validateAttemptBody({ choiceId: "   " }).ok).toBe(false);
    expect(validateAttemptBody({ choiceId: "choice-1" })).toEqual({
      ok: true,
      data: { choiceId: "choice-1" },
    });
  });
});
