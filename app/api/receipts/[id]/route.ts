import { db } from "@/src/lib/supabase";
import { memberFromRequest, unauthorized } from "@/src/lib/liff-auth";
import { confirmReceipt, type EditedLine } from "@/src/lib/receipts";
import { listActive } from "@/src/lib/inventory";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const member = await memberFromRequest(req);
  if (!member) return unauthorized();
  const { id } = await params;
  const { data, error } = await db()
    .from("receipts")
    .select("id, kind, store_name, purchased_on, total_yen, status, receipt_lines(id, line_no, raw_text, food_name, is_food, quantity, price_yen, confidence, storage, remaining_pct)")
    .eq("id", id)
    .eq("household_id", member.household_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return Response.json({ error: "見つかりません" }, { status: 404 });
  data.receipt_lines.sort((a, b) => a.line_no - b.line_no);
  // 冷蔵庫の写真では、すでに在庫にある物を見分けられるよう在庫の名前も返す。
  const inStock = data.kind === "fridge" ? (await listActive(member.household_id)).map((i) => i.name) : [];
  return Response.json({ ...data, in_stock: inStock });
}

export async function POST(req: Request, { params }: Ctx) {
  const member = await memberFromRequest(req);
  if (!member) return unauthorized();
  const { id } = await params;
  const body = (await req.json()) as { purchased_on: string; lines: EditedLine[] };
  try {
    return Response.json(await confirmReceipt(member, id, body.purchased_on, body.lines));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
