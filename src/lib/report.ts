import { lossYen } from "./expiry.ts";

export interface CostItem {
  name: string;
  price_yen: number | null;
  purchased_on: string; // YYYY-MM-DD
  status: "active" | "used_up" | "discarded";
  closed_at: string | null; // ISO（UTC）
  remaining_pct_at_close: number | null;
  category: string | null;
}

export interface MonthReport {
  month: string; // YYYY-MM
  spendYen: number;
  wasteYen: number;
  wasteRate: number; // 0〜1（廃棄額 / 食費）
  unpricedCount: number; // 金額が入っていない購入
  byCategory: { category: string; yen: number }[];
  wasted: { name: string; yen: number; remainingPct: number }[];
}

// 日本時間の YYYY-MM。
export function monthJst(iso: string): string {
  return new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

// 食費はその月に買った食材の金額、廃棄額はその月に捨てた食材の「金額 × 捨てたときの残量」。
export function monthReport(items: CostItem[], month: string): MonthReport {
  const bought = items.filter((i) => i.purchased_on.slice(0, 7) === month);
  const spendYen = bought.reduce((s, i) => s + (i.price_yen ?? 0), 0);
  const cats = new Map<string, number>();
  for (const i of bought) {
    if (!i.price_yen) continue;
    const c = i.category ?? "その他";
    cats.set(c, (cats.get(c) ?? 0) + i.price_yen);
  }
  const wasted = items
    .filter((i) => i.status === "discarded" && i.closed_at && monthJst(i.closed_at) === month)
    .map((i) => ({ name: i.name, yen: lossYen(i.price_yen, i.remaining_pct_at_close ?? 0), remainingPct: i.remaining_pct_at_close ?? 0 }))
    .sort((a, b) => b.yen - a.yen);
  const wasteYen = wasted.reduce((s, w) => s + w.yen, 0);
  return {
    month,
    spendYen,
    wasteYen,
    wasteRate: spendYen ? wasteYen / spendYen : 0,
    unpricedCount: bought.filter((i) => i.price_yen == null).length,
    byCategory: [...cats].map(([category, yen]) => ({ category, yen })).sort((a, b) => b.yen - a.yen),
    wasted,
  };
}

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

function diff(now: number, prev: number): string {
  if (!prev) return "";
  const d = now - prev;
  return d === 0 ? "（先月と同じ）" : `（先月より${d > 0 ? "+" : "−"}${yen(Math.abs(d))}）`;
}

export function reportText(cur: MonthReport, prev: MonthReport | null, title: string, url: string): string {
  const [, m] = cur.month.split("-");
  const lines = [
    `${title}（${Number(m)}月）`,
    `食費：${yen(cur.spendYen)}${prev ? diff(cur.spendYen, prev.spendYen) : ""}`,
    `廃棄：${yen(cur.wasteYen)}${cur.spendYen ? `（食費の${Math.round(cur.wasteRate * 100)}%）` : ""}${prev ? diff(cur.wasteYen, prev.wasteYen) : ""}`,
  ];
  if (cur.wasted.length) lines.push(`捨てた物：${cur.wasted.slice(0, 5).map((w) => w.name).join("、")}${cur.wasted.length > 5 ? " ほか" : ""}`);
  if (cur.unpricedCount) lines.push(`※金額が入っていない食材が${cur.unpricedCount}件あります`);
  lines.push("", `くわしく：${url}`);
  return lines.join("\n");
}
