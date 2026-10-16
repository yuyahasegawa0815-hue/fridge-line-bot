import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNotice, decodeAction, encodeAction, selectDue, stepDown, todayJst } from "./notify.ts";

const today = "2026-10-15";
const items = [
  { id: "a", name: "鶏むね肉", expires_on: "2026-10-16", remaining_pct: 100 },
  { id: "b", name: "卵", expires_on: "2026-10-25", remaining_pct: 100 },
  { id: "c", name: "豆腐", expires_on: "2026-10-18", remaining_pct: 50 },
  { id: "d", name: "牛乳", expires_on: "2026-10-14", remaining_pct: 25 },
];

test("日本時間で日付を切り替える", () => {
  assert.equal(todayJst(new Date("2026-10-14T15:00:00Z")), "2026-10-15");
  assert.equal(todayJst(new Date("2026-10-14T14:59:00Z")), "2026-10-14");
});

test("朝は3日以内と期限切れを、期限が早い順に選ぶ", () => {
  assert.deepEqual(selectDue(items, today, "morning").map((i) => i.id), ["d", "a", "c"]);
});

test("夕方は明日までのものだけ", () => {
  assert.deepEqual(selectDue(items, today, "evening").map((i) => i.id), ["d", "a"]);
});

test("ボタンの内容を往復できる", () => {
  assert.deepEqual(decodeAction(encodeAction("discard", "a")), { action: "discard", itemId: "a" });
  assert.equal(decodeAction("a=eat&id=x"), null);
});

test("減ったは1段階ずつ減らす", () => {
  assert.deepEqual([100, 50, 25].map(stepDown), [50, 25, 0]);
});

test("通知は10件までで、残りは件数を書く", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `${i}`, name: `食材${i}`, expires_on: today, remaining_pct: 100 }));
  const msg = buildNotice(many, today, "morning", "https://liff.line.me/x/inventory");
  const bubble = msg.contents as { body: { contents: unknown[] }; footer: { contents: { text?: string }[] } };
  assert.equal(bubble.body.contents.length, 10);
  assert.equal(bubble.footer.contents[0].text, "ほかに2件あるよ。一覧で見てね👀");
});
