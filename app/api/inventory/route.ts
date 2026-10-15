import { memberFromRequest, unauthorized } from "@/src/lib/liff-auth";
import { addManual, listActive, updateExpiry, updateRemaining } from "@/src/lib/inventory";

export async function GET(req: Request) {
  const member = await memberFromRequest(req);
  if (!member) return unauthorized();
  return Response.json(await listActive(member.household_id));
}

// 一覧画面の「食材を追加」。すでに冷蔵庫にある物は買った日をさかのぼれる。
export async function POST(req: Request) {
  const member = await memberFromRequest(req);
  if (!member) return unauthorized();
  const b = (await req.json()) as { name?: string; price_yen?: number | null; storage?: string | null; remaining_pct?: number; purchased_on?: string };
  const name = b.name?.trim().slice(0, 40);
  if (!name) return Response.json({ error: "品名を入れてください" }, { status: 400 });
  if (b.purchased_on && !/^\d{4}-\d{2}-\d{2}$/.test(b.purchased_on)) return Response.json({ error: "買った日が不正です" }, { status: 400 });
  const storage = b.storage === "fridge" || b.storage === "freezer" || b.storage === "pantry" ? b.storage : null;
  const remainingPct = b.remaining_pct === 25 || b.remaining_pct === 50 ? b.remaining_pct : 100;
  const price = typeof b.price_yen === "number" && b.price_yen >= 0 ? Math.round(b.price_yen) : null;
  const result = await addManual(member, { name, priceYen: price, storage, remainingPct, purchasedOn: b.purchased_on });
  return Response.json(result);
}

export async function PATCH(req: Request) {
  const member = await memberFromRequest(req);
  if (!member) return unauthorized();
  const body = (await req.json()) as { id: string; remaining_pct?: 0 | 25 | 50 | 100; discard?: boolean; expires_on?: string | null };
  try {
    if (body.expires_on !== undefined) {
      if (body.expires_on !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.expires_on)) {
        return Response.json({ error: "期限の日付が不正です" }, { status: 400 });
      }
      await updateExpiry(member.household_id, body.id, body.expires_on);
      return Response.json({ ok: true });
    }
    if (body.remaining_pct === undefined || ![0, 25, 50, 100].includes(body.remaining_pct)) {
      return Response.json({ error: "残量が不正です" }, { status: 400 });
    }
    await updateRemaining(member.household_id, body.id, body.remaining_pct, body.discard);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
