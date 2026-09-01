import { validateAttemptBody } from "@/lib/mcq-validation";
import {
  createAttempt,
  isMcqChoiceMismatchError,
  isMcqChoiceNotFoundError,
  isMcqNotFoundError,
} from "@/lib/services/mcq-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = validateAttemptBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const attempt = await createAttempt(id, parsed.data.choiceId);
    return Response.json({ attempt }, { status: 201 });
  } catch (error) {
    if (isMcqChoiceMismatchError(error)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (isMcqNotFoundError(error)) {
      return Response.json({ error: "MCQ not found" }, { status: 404 });
    }
    if (isMcqChoiceNotFoundError(error)) {
      return Response.json({ error: "Choice not found" }, { status: 404 });
    }

    console.error("Record attempt failed:", error);
    return Response.json({ error: "Unable to record attempt" }, { status: 500 });
  }
}
