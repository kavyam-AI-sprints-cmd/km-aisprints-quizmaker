import { validateRegisterBody } from "@/lib/auth-validation";
import { createUser, isUserConflictError } from "@/lib/services/user-service";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = validateRegisterBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const user = await createUser({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      username: parsed.data.username,
      email: parsed.data.email,
      passwordHash: parsed.data.password,
    });

    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (isUserConflictError(error)) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    return Response.json({ error: "Unable to register" }, { status: 500 });
  }
}
