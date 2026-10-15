import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateExpiry, lossYen, pickStorage } from "./expiry.ts";

const chicken = { fridge_days: 2, freezer_days: 30, pantry_days: null };
const onion = { fridge_days: null, freezer_days: 30, pantry_days: 30 };

test("冷蔵の目安日数を購入日に足す", () => {
  assert.equal(estimateExpiry("2026-10-30", "fridge", chicken), "2026-11-01");
});

test("目安がない保存場所は null", () => {
  assert.equal(estimateExpiry("2026-10-15", "pantry", chicken), null);
});

test("目安のない保存場所を指定されたら既定に戻す", () => {
  assert.equal(pickStorage("fridge", "pantry", onion), "pantry");
  assert.equal(pickStorage("freezer", "fridge", chicken), "freezer");
});

test("ロス額は残量に比例する", () => {
  assert.equal(lossYen(398, 50), 199);
  assert.equal(lossYen(null, 100), 0);
});
