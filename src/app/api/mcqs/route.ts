import { validateCreateMcqBody } from "@/lib/mcq-validation";
import { createMcq, isMcqValidationError, listMcqs } from "@/lib/services/mcq-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const mcqs = await listMcqs();
    return Response.json({ mcqs }, { status: 200 });
  } catch (error) {
    console.error("List MCQs failed:", error);
    return Response.json({ error: "Unable to list MCQs" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = validateCreateMcqBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const mcq = await createMcq(parsed.data);
    return Response.json({ mcq }, { status: 201 });
  } catch (error) {
    if (isMcqValidationError(error)) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    console.error("Create MCQ failed:", error);
    return Response.json({ error: "Unable to create MCQ" }, { status: 500 });
  }
}
