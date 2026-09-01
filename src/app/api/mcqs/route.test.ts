import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/mcqs/route";
import { createMcq, listMcqs } from "@/lib/services/mcq-service";

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
  return {
    ...actual,
    createMcq: vi.fn(),
    listMcqs: vi.fn(),
  };
});

const TEACHER_ID = "a".repeat(32);

const createBody = {
  name: "Arithmetic",
  question: "What is 2 + 2?",
  createdByUserId: TEACHER_ID,
  choices: [
    { text: "3", isCorrect: false },
    { text: "4", isCorrect: true },
  ],
};

const createdMcq = {
  id: "mcq-1",
  name: "Arithmetic",
  question: "What is 2 + 2?",
  createdByUserId: TEACHER_ID,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  choices: [
    {
      id: "c1",
      mcqId: "mcq-1",
      text: "3",
      isCorrect: false,
      position: 0,
    },
    {
      id: "c2",
      mcqId: "mcq-1",
      text: "4",
      isCorrect: true,
      position: 1,
    },
  ],
};

function jsonRequest(body: unknown, raw?: string) {
  return new Request("http://localhost/api/mcqs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

describe("GET /api/mcqs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and the mcq list", async () => {
    const summary = {
      id: createdMcq.id,
      name: createdMcq.name,
      question: createdMcq.question,
      createdByUserId: createdMcq.createdByUserId,
      createdAt: createdMcq.createdAt,
      updatedAt: createdMcq.updatedAt,
    };
    vi.mocked(listMcqs).mockResolvedValue([summary]);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ mcqs: [summary] });
  });

  it("returns 500 when the service throws", async () => {
    vi.mocked(listMcqs).mockRejectedValue(new Error("d1 unavailable"));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Unable to list MCQs" });
  });
});

describe("POST /api/mcqs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 and the created mcq", async () => {
    vi.mocked(createMcq).mockResolvedValue(createdMcq);

    const response = await POST(jsonRequest(createBody));
    const payload = (await response.json()) as { mcq: typeof createdMcq };

    expect(response.status).toBe(201);
    expect(payload.mcq).toEqual(createdMcq);
    expect(payload.mcq.choices).toHaveLength(2);
    expect(createMcq).toHaveBeenCalledWith({
      name: "Arithmetic",
      question: "What is 2 + 2?",
      createdByUserId: TEACHER_ID,
      choices: createBody.choices,
    });
  });

  it("does not set cookies", async () => {
    vi.mocked(createMcq).mockResolvedValue(createdMcq);

    const response = await POST(jsonRequest(createBody));

    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 400 on invalid JSON or invalid body", async () => {
    const invalidJson = await POST(jsonRequest(null, "{"));
    expect(invalidJson.status).toBe(400);

    const invalidBody = await POST(jsonRequest({ name: "Arithmetic" }));
    const payload = await invalidBody.json();
    expect(invalidBody.status).toBe(400);
    expect(payload).toEqual({ error: expect.any(String) });
    expect(createMcq).not.toHaveBeenCalled();
  });

  it("returns 500 when the service throws", async () => {
    vi.mocked(createMcq).mockRejectedValue(new Error("d1 unavailable"));

    const response = await POST(jsonRequest(createBody));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Unable to create MCQ" });
  });
});
