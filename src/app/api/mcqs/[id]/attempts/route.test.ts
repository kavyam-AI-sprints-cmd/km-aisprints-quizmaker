import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import {
  createAttempt,
  McqChoiceMismatchError,
  McqNotFoundError,
} from "@/lib/services/mcq-service";

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
  return {
    ...actual,
    createAttempt: vi.fn(),
  };
});

const correctAttempt = {
  id: "att-1",
  mcqId: "mcq-1",
  choiceId: "c2",
  isCorrect: true,
  createdAt: "2026-09-01T00:00:00.000Z",
};

const incorrectAttempt = {
  ...correctAttempt,
  id: "att-2",
  choiceId: "c1",
  isCorrect: false,
};

function context(id = "mcq-1") {
  return { params: Promise.resolve({ id }) };
}

function jsonRequest(body: unknown, raw?: string) {
  return new Request("http://localhost/api/mcqs/mcq-1/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

describe("POST /api/mcqs/:id/attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 and the attempt with isCorrect", async () => {
    vi.mocked(createAttempt).mockResolvedValueOnce(correctAttempt);
    const correct = await POST(jsonRequest({ choiceId: "c2" }), context());
    const correctPayload = await correct.json();

    expect(correct.status).toBe(201);
    expect(correctPayload.attempt).toEqual(correctAttempt);
    expect(correctPayload.attempt.isCorrect).toBe(true);
    expect(createAttempt).toHaveBeenCalledWith("mcq-1", "c2");

    vi.mocked(createAttempt).mockResolvedValueOnce(incorrectAttempt);
    const incorrect = await POST(jsonRequest({ choiceId: "c1" }), context());
    const incorrectPayload = await incorrect.json();

    expect(incorrect.status).toBe(201);
    expect(incorrectPayload.attempt.isCorrect).toBe(false);
  });

  it("returns 400 when choiceId is missing", async () => {
    const response = await POST(jsonRequest({}), context());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: expect.any(String) });
    expect(createAttempt).not.toHaveBeenCalled();
  });

  it("returns 400 when the choice does not belong to the mcq", async () => {
    vi.mocked(createAttempt).mockRejectedValue(new McqChoiceMismatchError());

    const response = await POST(jsonRequest({ choiceId: "other" }), context());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: "Choice does not belong to this MCQ" });
  });

  it("returns 404 when the mcq is missing", async () => {
    vi.mocked(createAttempt).mockRejectedValue(new McqNotFoundError());

    const response = await POST(jsonRequest({ choiceId: "c1" }), context("missing"));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({ error: "MCQ not found" });
  });

  it("returns 500 on unexpected failure", async () => {
    vi.mocked(createAttempt).mockRejectedValue(new Error("d1 unavailable"));

    const response = await POST(jsonRequest({ choiceId: "c2" }), context());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Unable to record attempt" });
  });
});
