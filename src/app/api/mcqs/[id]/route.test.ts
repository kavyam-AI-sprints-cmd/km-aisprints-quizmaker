import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PUT } from "./route";
import { deleteMcq, getMcqById, updateMcq } from "@/lib/services/mcq-service";

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
  return {
    ...actual,
    deleteMcq: vi.fn(),
    getMcqById: vi.fn(),
    updateMcq: vi.fn(),
  };
});

const TEACHER_ID = "a".repeat(32);

const mcq = {
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

const updateBody = {
  name: "Two plus two",
  question: "What is two plus two?",
  choices: [
    { id: "c1", text: "5", isCorrect: false },
    { id: "c2", text: "4", isCorrect: true },
  ],
};

function context(id = "mcq-1") {
  return { params: Promise.resolve({ id }) };
}

function jsonRequest(body: unknown, method = "PUT") {
  return new Request("http://localhost/api/mcqs/mcq-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/mcqs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and the mcq", async () => {
    vi.mocked(getMcqById).mockResolvedValue(mcq);

    const response = await GET(new Request("http://localhost/api/mcqs/mcq-1"), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ mcq });
    expect(getMcqById).toHaveBeenCalledWith("mcq-1");
  });

  it("returns 404 when missing", async () => {
    vi.mocked(getMcqById).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/mcqs/missing"), context("missing"));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({ error: "MCQ not found" });
  });

  it("returns 500 on unexpected failure", async () => {
    vi.mocked(getMcqById).mockRejectedValue(new Error("d1 unavailable"));

    const response = await GET(new Request("http://localhost/api/mcqs/mcq-1"), context());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Unable to load MCQ" });
  });
});

describe("PUT /api/mcqs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and the updated mcq", async () => {
    const updated = { ...mcq, name: updateBody.name, question: updateBody.question };
    vi.mocked(updateMcq).mockResolvedValue(updated);

    const response = await PUT(jsonRequest(updateBody), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ mcq: updated });
    expect(updateMcq).toHaveBeenCalledWith("mcq-1", {
      name: "Two plus two",
      question: "What is two plus two?",
      choices: updateBody.choices,
    });
  });

  it("returns 400 on invalid body", async () => {
    const response = await PUT(jsonRequest({ name: "Only name" }), context());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: expect.any(String) });
    expect(updateMcq).not.toHaveBeenCalled();
  });

  it("returns 404 when missing", async () => {
    vi.mocked(updateMcq).mockResolvedValue(null);

    const response = await PUT(jsonRequest(updateBody), context("missing"));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({ error: "MCQ not found" });
  });

  it("returns 500 on unexpected failure", async () => {
    vi.mocked(updateMcq).mockRejectedValue(new Error("d1 unavailable"));

    const response = await PUT(jsonRequest(updateBody), context());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Unable to update MCQ" });
  });
});

describe("DELETE /api/mcqs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 { ok: true }", async () => {
    vi.mocked(deleteMcq).mockResolvedValue(true);

    const response = await DELETE(new Request("http://localhost/api/mcqs/mcq-1"), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(deleteMcq).toHaveBeenCalledWith("mcq-1");
  });

  it("returns 404 when missing", async () => {
    vi.mocked(deleteMcq).mockResolvedValue(false);

    const response = await DELETE(new Request("http://localhost/api/mcqs/missing"), context("missing"));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({ error: "MCQ not found" });
  });

  it("returns 500 on unexpected failure", async () => {
    vi.mocked(deleteMcq).mockRejectedValue(new Error("d1 unavailable"));

    const response = await DELETE(new Request("http://localhost/api/mcqs/mcq-1"), context());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Unable to delete MCQ" });
  });
});
