import { db } from "./supabase";
import { estimateExpiry, pickStorage, type Storage } from "./expiry";
import type { Member } from "./household";

export async function listActive(householdId: string) {
  const { data, error } = await db()
    .from("inventory_items")
    .select("id, name, storage, quantity, price_yen, purchased_on, expires_on, remaining_pct")
    .eq("household_id", householdId)
    .eq("status", "active")
    .order("expires_on", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

// 「追加 いちご 398」のようなトークでの手入力登録。
export async function addManual(member: Member, name: string, priceYen: number | null) {
  const cols = "id, default_storage, fridge_days, freezer_days, pantry_days";
  const byName = await db().from("food_master").select(cols).eq("name", name).limit(1).maybeSingle();
  const m =
    byName.data ??
    (await db().from("food_master").select(cols).contains("aliases", [name]).limit(1).maybeSingle()).data;
  const today = new Date().toISOString().slice(0, 10);
  const storage: Storage = m ? pickStorage(null, m.default_storage, m) : "fridge";
  const { error } = await db().from("inventory_items").insert({
    household_id: member.household_id,
    food_master_id: m?.id ?? null,
    name,
    storage,
    price_yen: priceYen,
    purchased_on: today,
    expires_on: m ? estimateExpiry(today, storage, m) : null,
  });
  if (error) throw error;
  return { matched: !!m };
}

// 残量の更新。0 にすると「使い切った」、discard なら「捨てた」で閉じる。
export async function updateRemaining(householdId: string, itemId: string, remainingPct: 0 | 25 | 50 | 100, discard = false) {
  const { data: item } = await db()
    .from("inventory_items")
    .select("remaining_pct")
    .eq("id", itemId)
    .eq("household_id", householdId)
    .eq("status", "active")
    .maybeSingle();
  if (!item) throw new Error("在庫が見つかりません");
  const patch = discard
    ? { status: "discarded", closed_at: new Date().toISOString(), remaining_pct_at_close: item.remaining_pct, remaining_pct: 0 }
    : remainingPct === 0
      ? { status: "used_up", closed_at: new Date().toISOString(), remaining_pct_at_close: 0, remaining_pct: 0 }
      : { remaining_pct: remainingPct };
  const { error } = await db().from("inventory_items").update(patch).eq("id", itemId);
  if (error) throw error;
}
