import { memberFromRequest, unauthorized } from "@/src/lib/liff-auth";
import { listActive, updateRemaining } from "@/src/lib/inventory";

export async function GET(req: Request) {
  const member = await memberFromRequest(req);
  if (!member) return unauthorized();
  return Response.json(await listActive(member.household_id));
}

export async function PATCH(req: Request) {
  const member = await memberFromRequest(req);
  if (!member) return unauthorized();
  const body = (await req.json()) as { id: string; remaining_pct: 0 | 25 | 50 | 100; discard?: boolean };
  if (![0, 25, 50, 100].includes(body.remaining_pct)) return Response.json({ error: "残量が不正です" }, { status: 400 });
  try {
    await updateRemaining(member.household_id, body.id, body.remaining_pct, body.discard);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
