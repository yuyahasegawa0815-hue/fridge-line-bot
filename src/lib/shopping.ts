import { db } from "./supabase";

export interface ShoppingItem {
  id: string;
  name: string;
  reason: string | null;
  done: boolean;
}

// 未購入のものだけ。買った物は画面を開いている間だけ取り消せる。
export async function listShopping(householdId: string): Promise<ShoppingItem[]> {
  const { data, error } = await db()
    .from("shopping_list")
    .select("id, name, reason, done")
    .eq("household_id", householdId)
    .eq("done", false)
    .order("created_at");
  if (error) throw error;
  return data;
}

// 未購入リストにない物だけ足す。足した名前を返す。
export async function addShopping(householdId: string, names: string[], reason: string | null): Promise<string[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (!unique.length) return [];
  const { data: open, error } = await db().from("shopping_list").select("name").eq("household_id", householdId).eq("done", false);
  if (error) throw error;
  const have = new Set(open.map((o) => o.name));
  const fresh = unique.filter((n) => !have.has(n));
  if (fresh.length) {
    const { error: insErr } = await db()
      .from("shopping_list")
      .insert(fresh.map((name) => ({ household_id: householdId, name, reason })));
    if (insErr) throw insErr;
  }
  return fresh;
}

export async function setBought(householdId: string, id: string, done: boolean) {
  const { error } = await db()
    .from("shopping_list")
    .update({ done })
    .eq("id", id)
    .eq("household_id", householdId);
  if (error) throw error;
}

export async function removeShopping(householdId: string, id: string) {
  const { error } = await db().from("shopping_list").delete().eq("id", id).eq("household_id", householdId);
  if (error) throw error;
}

// レシートを登録したら、同じ名前の未購入アイテムを買ったことにする。
export async function markBoughtByNames(householdId: string, names: string[]) {
  if (!names.length) return;
  const { error } = await db()
    .from("shopping_list")
    .update({ done: true })
    .eq("household_id", householdId)
    .eq("done", false)
    .in("name", names);
  if (error) throw error;
}

// 最近使い切った・捨てた物のうち、在庫にも買い物リストにもない物（買い忘れ候補）。
export async function restockCandidates(householdId: string): Promise<string[]> {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [closed, active, open] = await Promise.all([
    db().from("inventory_items").select("name").eq("household_id", householdId).neq("status", "active").gte("closed_at", since),
    db().from("inventory_items").select("name").eq("household_id", householdId).eq("status", "active"),
    db().from("shopping_list").select("name").eq("household_id", householdId).eq("done", false),
  ]);
  for (const r of [closed, active, open]) if (r.error) throw r.error;
  const skip = new Set([...active.data!, ...open.data!].map((r) => r.name));
  return [...new Set(closed.data!.map((r) => r.name))].filter((n) => !skip.has(n)).slice(0, 10);
}
