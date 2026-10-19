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

test("英語・フランス語・韓国語・中国語の言い方も読む", () => {
  const r = parseAddLines("chicken breast 398 freezer\ncabbage half 3d\nlait moitié hier\n우유 반 냉장 2일전\n牛奶 一半 3天前");
  assert.deepEqual(
    r.map((e) => [e.name, e.priceYen, e.remainingPct, e.storage, e.daysAgo]),
    [
      ["chicken breast", 398, 100, "freezer", 0],
      ["cabbage", null, 50, null, 3],
      ["lait", null, 50, null, 1],
      ["우유", null, 50, "fridge", 2],
      ["牛奶", null, 50, null, 3],
    ],
  );
});
