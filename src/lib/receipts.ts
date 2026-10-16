import { db, RECEIPT_BUCKET } from "./supabase";
import { extractReceipt, type ExtractedReceipt } from "./receipt-ai";
import { estimateExpiry, pickStorage, type ShelfLife, type Storage } from "./expiry";
import type { Member } from "./household";
import { markBoughtByNames } from "./shopping";

interface MasterRow extends ShelfLife {
  id: number;
  name: string;
  default_storage: Storage;
}

async function loadMaster(): Promise<MasterRow[]> {
  const { data, error } = await db()
    .from("food_master")
    .select("id, name, default_storage, fridge_days, freezer_days, pantry_days")
    .order("id");
  if (error) throw error;
  return data;
}

// マスタにない食材は AI の目安日数でマスタに追加する。
async function masterIdFor(line: ExtractedReceipt["lines"][number], master: MasterRow[]): Promise<number | null> {
  const known = master.find((m) => m.name === line.master_name);
  if (known) return known.id;
  if (!line.is_food || !line.food_name || !line.estimated_days) return null;
  const { data, error } = await db()
    .from("food_master")
    .upsert(
      {
        name: line.food_name,
        category: "その他",
        default_storage: line.storage ?? "fridge",
        fridge_days: line.estimated_days.fridge,
        freezer_days: line.estimated_days.freezer,
        pantry_days: line.estimated_days.pantry,
        source: "ai",
      },
      { onConflict: "name" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// AI の残量の目安を 100/50/25 に丸める。
export function roundRemaining(pct: number | null): 25 | 50 | 100 | null {
  if (pct == null) return null;
  return pct > 75 ? 100 : pct > 37 ? 50 : 25;
}

// 画像を読み取り、確認待ち（draft）として保存する。レシートと冷蔵庫の写真の両方を扱う。
// レシートでも冷蔵庫でもない写真（グループに送られた普通の写真）は何も保存せず null を返す。
export async function createDraftReceipt(member: Member, image: Buffer, mediaType: "image/jpeg" | "image/png") {
  const master = await loadMaster();
  const extracted = await extractReceipt(
    { data: image.toString("base64"), mediaType },
    master.map((m) => m.name),
  );
  if (extracted.kind === "other") return null;
  const kind = extracted.kind;

  const imagePath = `${member.household_id}/${crypto.randomUUID()}.${mediaType === "image/png" ? "png" : "jpg"}`;
  const upload = await db().storage.from(RECEIPT_BUCKET).upload(imagePath, image, { contentType: mediaType });
  if (upload.error) throw upload.error;

  const { data: receipt, error } = await db()
    .from("receipts")
    .insert({
      household_id: member.household_id,
      created_by: member.id,
      store_name: extracted.store_name,
      purchased_on: extracted.purchased_on ?? undefined,
      total_yen: extracted.total_yen,
      image_path: imagePath,
      kind,
    })
    .select("id")
    .single();
  if (error) throw error;

  const rows = [];
  for (const [i, line] of extracted.lines.entries()) {
    rows.push({
      receipt_id: receipt.id,
      line_no: i + 1,
      raw_text: line.raw_text,
      food_name: line.food_name,
      food_master_id: await masterIdFor(line, master),
      is_food: line.is_food,
      quantity: line.quantity,
      price_yen: kind === "fridge" ? null : line.price_yen,
      confidence: line.confidence,
      storage: line.storage,
      remaining_pct: kind === "fridge" ? roundRemaining(line.remaining_pct) : null,
    });
  }
  if (rows.length) {
    const { error: lErr } = await db().from("receipt_lines").insert(rows);
    if (lErr) throw lErr;
  }
  return { id: receipt.id as string, kind, lineCount: rows.length, lowConfidence: rows.filter((r) => r.confidence < 0.7).length };
}

export interface EditedLine {
  id?: string;
  food_name: string;
  is_food: boolean;
  quantity: number;
  price_yen: number | null;
  storage: Storage;
  remaining_pct?: 25 | 50 | 100;
  purchased_on?: string; // 冷蔵庫の写真で、行ごとに買った日を選んだとき
}

// 確認画面での修正を反映し、食材の行を在庫に登録する。
export async function confirmReceipt(member: Member, receiptId: string, purchasedOn: string, lines: EditedLine[]) {
  const { data: receipt } = await db()
    .from("receipts")
    .select("id, status, kind")
    .eq("id", receiptId)
    .eq("household_id", member.household_id)
    .maybeSingle();
  if (!receipt) throw new Error("見つかりません");
  if (receipt.status === "confirmed") throw new Error("登録済みです");

  const master = await loadMaster();
  await db().from("receipt_lines").delete().eq("receipt_id", receiptId);
  const items = [];
  for (const [i, line] of lines.entries()) {
    const m = master.find((x) => x.name === line.food_name);
    const { data: saved, error } = await db()
      .from("receipt_lines")
      .insert({
        receipt_id: receiptId,
        line_no: i + 1,
        raw_text: line.food_name,
        food_name: line.food_name,
        food_master_id: m?.id ?? null,
        is_food: line.is_food,
        quantity: line.quantity,
        price_yen: line.price_yen,
        confidence: 1,
        storage: line.storage,
        remaining_pct: line.remaining_pct ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    if (!line.is_food) continue;
    const storage = m ? pickStorage(line.storage, m.default_storage, m) : line.storage;
    const boughtOn = line.purchased_on && /^\d{4}-\d{2}-\d{2}$/.test(line.purchased_on) ? line.purchased_on : purchasedOn;
    const remaining = line.remaining_pct === 25 || line.remaining_pct === 50 ? line.remaining_pct : 100;
    items.push({
      household_id: member.household_id,
      receipt_line_id: saved.id,
      food_master_id: m?.id ?? null,
      name: line.food_name,
      storage,
      quantity: line.quantity,
      price_yen: line.price_yen,
      purchased_on: boughtOn,
      expires_on: m ? estimateExpiry(boughtOn, storage, m) : null,
      remaining_pct: remaining,
    });
  }
  if (items.length) {
    const { error } = await db().from("inventory_items").insert(items);
    if (error) throw error;
  }
  await db().from("receipts").update({ status: "confirmed", purchased_on: purchasedOn }).eq("id", receiptId);
  // 冷蔵庫の写真は「今ある物」なので、買い物リストは消さない。
  if (receipt.kind === "receipt") await markBoughtByNames(member.household_id, items.map((i) => i.name));
  return { added: items.length };
}
