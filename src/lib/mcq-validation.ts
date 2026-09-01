export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type McqChoiceInput = {
  id?: string;
  text: string;
  isCorrect: boolean;
};

export type CreateMcqBody = {
  name: string;
  question: string;
  createdByUserId: string;
  choices: McqChoiceInput[];
};

export type UpdateMcqBody = {
  name: string;
  question: string;
  choices: McqChoiceInput[];
};

export type AttemptBody = {
  choiceId: string;
};

function fail(error: string): ValidationResult<never> {
  return { ok: false, error };
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseChoices(value: unknown): ValidationResult<McqChoiceInput[]> {
  if (!Array.isArray(value)) {
    return fail("Choices are required");
  }
  if (value.length < 2) {
    return fail("An MCQ must have at least two choices");
  }
  if (value.length > 6) {
    return fail("An MCQ cannot have more than six choices");
  }

  const choices: McqChoiceInput[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object") {
      return fail("Each choice must be an object");
    }
    const raw = item as Record<string, unknown>;
    const text = asTrimmedString(raw.text);
    if (!text) {
      return fail("Choice text is required");
    }
    if (typeof raw.isCorrect !== "boolean") {
      return fail("Each choice must include isCorrect");
    }
    const id = asTrimmedString(raw.id);
    choices.push(id ? { id, text, isCorrect: raw.isCorrect } : { text, isCorrect: raw.isCorrect });
  }

  const correctCount = choices.filter((choice) => choice.isCorrect).length;
  if (correctCount !== 1) {
    return fail("Exactly one choice must be correct");
  }

  return { ok: true, data: choices };
}

function parseWriteFields(body: unknown) {
  if (body === null || typeof body !== "object") {
    return fail("Invalid request body");
  }

  const input = body as Record<string, unknown>;
  const name = asTrimmedString(input.name);
  const question = asTrimmedString(input.question);
  if (!name) return fail("Name is required");
  if (!question) return fail("Question is required");

  const choices = parseChoices(input.choices);
  if (!choices.ok) {
    return choices;
  }

  return { ok: true as const, name, question, choices: choices.data, input };
}

export function validateCreateMcqBody(body: unknown): ValidationResult<CreateMcqBody> {
  const parsed = parseWriteFields(body);
  if (!parsed.ok) {
    return parsed;
  }

  const createdByUserId = asTrimmedString(parsed.input.createdByUserId);
  if (!createdByUserId) {
    return fail("Created by user id is required");
  }

  return {
    ok: true,
    data: {
      name: parsed.name,
      question: parsed.question,
      createdByUserId,
      choices: parsed.choices,
    },
  };
}

export function validateUpdateMcqBody(body: unknown): ValidationResult<UpdateMcqBody> {
  const parsed = parseWriteFields(body);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    data: {
      name: parsed.name,
      question: parsed.question,
      choices: parsed.choices,
    },
  };
}

export function validateAttemptBody(body: unknown): ValidationResult<AttemptBody> {
  if (body === null || typeof body !== "object") {
    return fail("Invalid request body");
  }

  const choiceId = asTrimmedString((body as Record<string, unknown>).choiceId);
  if (!choiceId) {
    return fail("Choice id is required");
  }

  return { ok: true, data: { choiceId } };
}
