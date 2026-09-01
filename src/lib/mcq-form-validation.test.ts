import { describe, expect, it } from "vitest";
import { validateMcqForm } from "@/lib/mcq-form-validation";

const validForm = {
  name: "Arithmetic",
  question: "What is 2 + 2?",
  choices: [
    { text: "3", isCorrect: false },
    { text: "4", isCorrect: true },
  ],
};

describe("validateMcqForm", () => {
  it("accepts a valid form", () => {
    expect(validateMcqForm(validForm)).toBeNull();
  });

  it("rejects blank name", () => {
    expect(validateMcqForm({ ...validForm, name: "   " })).toMatch(/name/i);
  });

  it("rejects blank question", () => {
    expect(validateMcqForm({ ...validForm, question: "" })).toMatch(/question/i);
  });

  it("rejects fewer than two choices", () => {
    expect(
      validateMcqForm({
        ...validForm,
        choices: [{ text: "4", isCorrect: true }],
      }),
    ).toMatch(/two/i);
  });

  it("rejects more than six choices", () => {
    expect(
      validateMcqForm({
        ...validForm,
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
    ).toMatch(/six/i);
  });

  it("rejects blank choice text", () => {
    expect(
      validateMcqForm({
        ...validForm,
        choices: [
          { text: "   ", isCorrect: false },
          { text: "4", isCorrect: true },
        ],
      }),
    ).toMatch(/choice/i);
  });

  it("rejects zero or two correct choices", () => {
    expect(
      validateMcqForm({
        ...validForm,
        choices: [
          { text: "3", isCorrect: false },
          { text: "4", isCorrect: false },
        ],
      }),
    ).toMatch(/exactly one/i);

    expect(
      validateMcqForm({
        ...validForm,
        choices: [
          { text: "3", isCorrect: true },
          { text: "4", isCorrect: true },
        ],
      }),
    ).toMatch(/exactly one/i);
  });
});
