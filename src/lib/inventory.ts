import { db } from "./supabase";
import { estimateExpiry, lossYen, pickStorage, type Storage } from "./expiry";
import { stepDown, todayJst, type DueItem, type ItemAction } from "./notify";
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

export interface ManualItem {
  name: string;
  priceYen: number | null;
  storage?: Storage | null;
  remainingPct?: 25 | 50 | 100;
  purchasedOn?: string; // YYYY-MM-DD。省略時は今日
}

// トークや一覧画面からの手入力登録。すでに冷蔵庫にある物は買った日をさかのぼって期限を出す。
export async function addManual(member: Member, input: ManualItem) {
  const cols = "id, default_storage, fridge_days, freezer_days, pantry_days";
  const byName = await db().from("food_master").select(cols).eq("name", input.name).limit(1).maybeSingle();
  const m =
    byName.data ??
    (await db().from("food_master").select(cols).contains("aliases", [input.name]).limit(1).maybeSingle()).data;
  const purchasedOn = input.purchasedOn ?? todayJst();
  const storage: Storage = m ? pickStorage(input.storage ?? null, m.default_storage, m) : (input.storage ?? "fridge");
  const expiresOn = m ? estimateExpiry(purchasedOn, storage, m) : null;
  const { error } = await db().from("inventory_items").insert({
    household_id: member.household_id,
    food_master_id: m?.id ?? null,
    name: input.name,
    storage,
    price_yen: input.priceYen,
    purchased_on: purchasedOn,
    expires_on: expiresOn,
    remaining_pct: input.remainingPct ?? 100,
  });
  if (error) throw error;
  return { matched: !!m, expiresOn };
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

// 期限が分からない食材などに、一覧画面から期限を入れる。
export async function updateExpiry(householdId: string, itemId: string, expiresOn: string | null) {
  const { error, count } = await db()
    .from("inventory_items")
    .update({ expires_on: expiresOn }, { count: "exact" })
    .eq("id", itemId)
    .eq("household_id", householdId)
    .eq("status", "active");
  if (error) throw error;
  if (!count) throw new Error("在庫が見つかりません");
}

// 期限通知のボタン（減った・使い切った・捨てた）を反映し、返信用の一文を返す。
export async function applyNoticeAction(householdId: string, itemId: string, action: ItemAction): Promise<string> {
  const { data: item } = await db()
    .from("inventory_items")
    .select("name, remaining_pct, price_yen, status")
    .eq("id", itemId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (!item) return "その食材が見つかりませんでした。";
  if (item.status !== "active") return `${item.name}はもう記録済みです。`;
  if (action === "discard") {
    await updateRemaining(householdId, itemId, 0, true);
    const loss = lossYen(item.price_yen, item.remaining_pct);
    return `${item.name}を「捨てた」で記録しました${loss ? `（ロス ${loss.toLocaleString()}円）` : ""}。`;
  }
  const next = action === "used_up" ? 0 : stepDown(item.remaining_pct);
  await updateRemaining(householdId, itemId, next);
  return next === 0 ? `${item.name}を使い切りにしました。` : `${item.name}の残りを${next}%にしました。`;
}

// 期限通知の対象になりうる在庫（期限まで3日以内）を世帯ごとに返す。
export async function dueItemsByHousehold(today: string) {
  const limit = new Date(Date.parse(today) + 3 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db()
    .from("inventory_items")
    .select("id, name, expires_on, remaining_pct, households(id, line_group_id)")
    .eq("status", "active")
    .not("expires_on", "is", null)
    .lte("expires_on", limit);
  if (error) throw error;
  const groups = new Map<string, { lineGroupId: string; items: DueItem[] }>();
  for (const row of data as unknown as (DueItem & { households: { id: string; line_group_id: string } })[]) {
    const g = groups.get(row.households.id) ?? { lineGroupId: row.households.line_group_id, items: [] };
    g.items.push({ id: row.id, name: row.name, expires_on: row.expires_on, remaining_pct: row.remaining_pct });
    groups.set(row.households.id, g);
  }
  return [...groups.values()];
}
