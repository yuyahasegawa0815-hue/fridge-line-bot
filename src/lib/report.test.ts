import { test } from "node:test";
import assert from "node:assert/strict";
import { monthJst, monthReport, reportText, shiftMonth, type CostItem } from "./report.ts";

const item = (over: Partial<CostItem>): CostItem => ({
  name: "牛乳",
  price_yen: 200,
  purchased_on: "2026-10-03",
  status: "active",
  closed_at: null,
  remaining_pct_at_close: null,
  category: "卵・乳製品",
  ...over,
});

test("monthJst は日本時間で月を決める", () => {
  assert.equal(monthJst("2026-09-30T15:30:00Z"), "2026-10");
  assert.equal(monthJst("2026-09-30T14:59:00Z"), "2026-09");
});

test("shiftMonth は年をまたぐ", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
});

test("monthReport：食費は購入月、廃棄は捨てた月の残量分", () => {
  const items = [
    item({ name: "牛乳", price_yen: 200 }),
    item({ name: "豚こま", price_yen: 400, category: "肉" }),
    item({ name: "豆腐", price_yen: null, category: "大豆製品" }),
    item({ name: "キャベツ", price_yen: 300, purchased_on: "2026-09-28", category: "野菜", status: "discarded", closed_at: "2026-10-05T01:00:00Z", remaining_pct_at_close: 50 }),
    item({ name: "卵", price_yen: 250, purchased_on: "2026-09-20", status: "used_up", closed_at: "2026-10-02T01:00:00Z", remaining_pct_at_close: 0 }),
  ];
  const r = monthReport(items, "2026-10");
  assert.equal(r.spendYen, 600);
  assert.equal(r.wasteYen, 150);
  assert.equal(r.wasteRate, 0.25);
  assert.equal(r.unpricedCount, 1);
  assert.deepEqual(r.byCategory, [{ category: "肉", yen: 400 }, { category: "卵・乳製品", yen: 200 }]);
  assert.deepEqual(r.wasted, [{ name: "キャベツ", yen: 150, remainingPct: 50 }]);
  assert.equal(monthReport(items, "2026-09").spendYen, 550);
});

test("reportText は先月との差を出す", () => {
  const cur = monthReport([item({ price_yen: 1500 })], "2026-10");
  const prev = monthReport([item({ price_yen: 1000, purchased_on: "2026-09-10" })], "2026-09");
  const text = reportText(cur, prev, "今月の食費", "https://example.com");
  assert.match(text, /食費：1,500円（先月より\+500円）/);
  assert.match(text, /廃棄：0円（食費の0%）/);
});
