export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request) {
  return Response.json({ ok: true }, { status: 200 });
}
