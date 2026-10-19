import { db, RECEIPT_BUCKET } from "./supabase";
import { extractReceipt, type ExtractedReceipt } from "./receipt-ai";
import { estimateExpiry, pickStorage, type Storage } from "./expiry";
import { addAlias, findMaster, loadMaster, resolveForeignNames, upsertAiMaster, type MasterRow } from "./food-master";
import type { Member } from "./household";
import { markBoughtByNames } from "./shopping";

// マスタにない食材は AI の目安日数でマスタに追加する。日本語以外の品名はマスタの別名として覚える。
async function masterFor(line: ExtractedReceipt["lines"][number], master: MasterRow[]): Promise<MasterRow | null> {
  let row = line.master_name ? master.find((m) => m.name === line.master_name) : undefined;
  if (!row && line.name_ja) row = findMaster(master, line.name_ja);
  if (!row && line.is_food && line.food_name && line.estimated_days) {
    row = await upsertAiMaster({ name: line.name_ja ?? line.food_name, storage: line.storage, days: line.estimated_days });
    master.push(row);
  }
  if (row && line.food_name) await addAlias(row, line.food_name);
  return row ?? null;
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
    member.lang,
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
      food_master_id: (await masterFor(line, master))?.id ?? null,
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
  food_master_id?: number | null; // 読み取り時に結びついたマスタ（名前を直していなければ画面がそのまま返す）
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
  const masterOf = (line: EditedLine) =>
    (line.food_master_id != null ? master.find((x) => x.id === line.food_master_id) : undefined) ?? findMaster(master, line.food_name);
  // 日本語以外で手入力・修正された品名は、まとめて AI で日本語のマスタに結びつける
  const unknown = member.lang === "ja" ? [] : lines.filter((l) => l.is_food && !masterOf(l)).map((l) => l.food_name);
  const foreign = await resolveForeignNames(unknown, master);
  await db().from("receipt_lines").delete().eq("receipt_id", receiptId);
  const items = [];
  for (const [i, line] of lines.entries()) {
    const m = masterOf(line) ?? foreign.get(line.food_name);
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
