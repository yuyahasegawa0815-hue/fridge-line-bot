import { db } from "./supabase";
import { monthReport, shiftMonth, type CostItem, type MonthReport } from "./report";

// month から過去 months か月分の集計。捨てた日が購入月より後でも拾えるよう、閉じた日でも絞り込む。
export async function monthlyReports(householdId: string, month: string, months: number): Promise<MonthReport[]> {
  const from = `${shiftMonth(month, -(months - 1))}-01`;
  const fromUtc = new Date(Date.parse(from) - 9 * 3_600_000).toISOString();
  const { data, error } = await db()
    .from("inventory_items")
    .select("name, price_yen, purchased_on, status, closed_at, remaining_pct_at_close, food_master(category)")
    .eq("household_id", householdId)
    .or(`purchased_on.gte.${from},closed_at.gte."${fromUtc}"`);
  if (error) throw error;
  const items: CostItem[] = (data as unknown as (Omit<CostItem, "category"> & { food_master: { category: string } | null })[]).map(
    ({ food_master, ...rest }) => ({ ...rest, category: food_master?.category ?? null }),
  );
  return Array.from({ length: months }, (_, i) => monthReport(items, shiftMonth(month, -i)));
}

// 先月に何か記録がある世帯（月初の振り返り通知の対象）。
export async function householdsWithActivity(month: string) {
  const from = `${month}-01`;
  const to = `${shiftMonth(month, 1)}-01`;
  const { data, error } = await db()
    .from("inventory_items")
    .select("household_id, households(line_group_id)")
    .gte("purchased_on", from)
    .lt("purchased_on", to);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const r of data as unknown as { household_id: string; households: { line_group_id: string } }[]) {
    map.set(r.household_id, r.households.line_group_id);
  }
  return [...map].map(([id, lineGroupId]) => ({ id, lineGroupId }));
}
