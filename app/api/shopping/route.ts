import { memberFromRequest, unauthorized } from "@/src/lib/liff-auth";
import { addShopping, listShopping, removeShopping, restockCandidates, setBought } from "@/src/lib/shopping";

export async function GET(req: Request) {
  const member = await memberFromRequest(req);
  if (!member) return unauthorized();
  const [items, suggestions] = await Promise.all([listShopping(member.household_id), restockCandidates(member.household_id)]);
  return Response.json({ items, suggestions });
}

export async function POST(req: Request) {
  const member = await memberFromRequest(req);
  if (!member) return unauthorized();
  const body = (await req.json()) as { names?: unknown };
  const names = Array.isArray(body.names) ? body.names.filter((n): n is string => typeof n === "string" && n.length <= 40) : [];
  if (!names.length) return Response.json({ error: "品名を入れてください" }, { status: 400 });
  return Response.json({ added: await addShopping(member.household_id, names, null) });
}

export async function PATCH(req: Request) {
  const member = await memberFromRequest(req);
  if (!member) return unauthorized();
  const body = (await req.json()) as { id?: string; done?: boolean; remove?: boolean };
  if (!body.id) return Response.json({ error: "対象がありません" }, { status: 400 });
  if (body.remove) await removeShopping(member.household_id, body.id);
  else await setBought(member.household_id, body.id, !!body.done);
  return Response.json({ ok: true });
}
