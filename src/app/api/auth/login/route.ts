import { validateLoginBody } from "@/lib/auth-validation";
import { getUserByUsername, hashesEqual } from "@/lib/services/user-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = validateLoginBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const stored = await getUserByUsername(parsed.data.username);
    if (!stored || !hashesEqual(parsed.data.password, stored.passwordHash)) {
      return Response.json(
        { error: "Invalid username or password" },
        { status: 401 },
      );
    }

    const user = {
      id: stored.id,
      firstName: stored.firstName,
      lastName: stored.lastName,
      username: stored.username,
      email: stored.email,
    };

    return Response.json({ user }, { status: 200 });
  } catch (error) {
    console.error("Login failed:", error);
    return Response.json({ error: "Unable to login" }, { status: 500 });
  }
}
