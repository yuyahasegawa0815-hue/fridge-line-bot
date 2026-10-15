import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAddLines } from "./add-parse.ts";

test("1件：品名と金額", () => {
  assert.deepEqual(parseAddLines("牛乳 198"), [{ name: "牛乳", priceYen: 198, remainingPct: 100, storage: null, daysAgo: 0 }]);
});

test("改行と読点で複数件、残量・保存場所・何日前を読む", () => {
  const r = parseAddLines("牛乳 198円\nキャベツ 半分 3日前、豚こま 冷凍 ４００,卵");
  assert.deepEqual(
    r.map((e) => [e.name, e.priceYen, e.remainingPct, e.storage, e.daysAgo]),
    [
      ["牛乳", 198, 100, null, 0],
      ["キャベツ", null, 50, null, 3],
      ["豚こま", 400, 100, "freezer", 0],
      ["卵", null, 100, null, 0],
    ],
  );
});

test("品名がない行や数字だけは無視する", () => {
  assert.deepEqual(parseAddLines("\n 198 \n、"), []);
});
