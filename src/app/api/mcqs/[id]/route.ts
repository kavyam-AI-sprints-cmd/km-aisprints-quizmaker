import { validateUpdateMcqBody } from "@/lib/mcq-validation";
import {
  deleteMcq,
  getMcqById,
  isMcqValidationError,
  updateMcq,
} from "@/lib/services/mcq-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const mcq = await getMcqById(id);
    if (!mcq) {
      return Response.json({ error: "MCQ not found" }, { status: 404 });
    }
    return Response.json({ mcq }, { status: 200 });
  } catch (error) {
    console.error("Load MCQ failed:", error);
    return Response.json({ error: "Unable to load MCQ" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = validateUpdateMcqBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const mcq = await updateMcq(id, parsed.data);
    if (!mcq) {
      return Response.json({ error: "MCQ not found" }, { status: 404 });
    }
    return Response.json({ mcq }, { status: 200 });
  } catch (error) {
    if (isMcqValidationError(error)) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    console.error("Update MCQ failed:", error);
    return Response.json({ error: "Unable to update MCQ" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const removed = await deleteMcq(id);
    if (!removed) {
      return Response.json({ error: "MCQ not found" }, { status: 404 });
    }
    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Delete MCQ failed:", error);
    return Response.json({ error: "Unable to delete MCQ" }, { status: 500 });
  }
}
