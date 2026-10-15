import { db } from "@/src/lib/supabase";
import { memberFromRequest, unauthorized } from "@/src/lib/liff-auth";
import { confirmReceipt, type EditedLine } from "@/src/lib/receipts";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const member = await memberFromRequest(req);
  if (!member) return unauthorized();
  const { id } = await params;
  const { data, error } = await db()
    .from("receipts")
    .select("id, store_name, purchased_on, total_yen, status, receipt_lines(id, line_no, raw_text, food_name, is_food, quantity, price_yen, confidence, storage)")
    .eq("id", id)
    .eq("household_id", member.household_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return Response.json({ error: "見つかりません" }, { status: 404 });
  data.receipt_lines.sort((a, b) => a.line_no - b.line_no);
  return Response.json(data);
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
