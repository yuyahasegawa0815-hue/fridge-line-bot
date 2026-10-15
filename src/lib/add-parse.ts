import type { Storage } from "./expiry.ts";

export interface AddEntry {
  name: string;
  priceYen: number | null;
  remainingPct: 25 | 50 | 100;
  storage: Storage | null;
  daysAgo: number; // 何日前に買ったか（0 = 今日）
}

const REMAINING: Record<string, 25 | 50 | 100> = { たっぷり: 100, 全部: 100, 半分: 50, 少し: 25, ちょっと: 25 };
const STORAGE: Record<string, Storage> = { 冷蔵: "fridge", 冷凍: "freezer", 常温: "pantry" };
const toHalf = (s: string) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

// 「追加」のあとの本文を食材ごとに分ける。改行・読点・カンマで区切り、1件は「品名 金額 残量 保存場所 ○日前」の順不同。
export function parseAddLines(body: string): AddEntry[] {
  return body
    .split(/[\n、,，]+/)
    .map((chunk) => chunk.trim().split(/\s+/).filter(Boolean))
    .filter((tokens) => tokens.length > 0)
    .flatMap((tokens) => {
      const entry: AddEntry = { name: "", priceYen: null, remainingPct: 100, storage: null, daysAgo: 0 };
      const nameParts: string[] = [];
      for (const raw of tokens) {
        const t = toHalf(raw);
        const price = t.match(/^[¥￥]?(\d+)円?$/);
        const ago = t.match(/^(\d+)日前$/);
        if (price) {
          if (nameParts.length) entry.priceYen = Number(price[1]);
        }
        else if (ago) entry.daysAgo = Math.min(Number(ago[1]), 60);
        else if (t === "昨日") entry.daysAgo = 1;
        else if (REMAINING[t]) entry.remainingPct = REMAINING[t];
        else if (STORAGE[t]) entry.storage = STORAGE[t];
        else nameParts.push(raw);
      }
      entry.name = nameParts.join(" ").slice(0, 40);
      return entry.name ? [entry] : [];
    })
    .slice(0, 30);
}
