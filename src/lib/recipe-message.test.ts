import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRecipes, decodeShop, encodeShop } from "./recipe-message.ts";

test("encodeShop / decodeShop の往復", () => {
  assert.deepEqual(decodeShop(encodeShop(["玉ねぎ", "生クリーム"])), ["玉ねぎ", "生クリーム"]);
  assert.equal(decodeShop("a=less&id=x"), null);
  assert.equal(decodeShop("shop:"), null);
});

test("encodeShop は300文字を超えない", () => {
  const data = encodeShop(Array.from({ length: 100 }, (_, i) => `とても長い食材の名前${i}`));
  assert.ok(data.length <= 300);
  assert.ok((decodeShop(data) ?? []).length > 0);
});

test("buildRecipes は買い足しがないと購入ボタンを出さない", () => {
  const msg = buildRecipes(
    [
      { title: "親子丼", minutes: 20, uses: ["鶏もも肉", "卵"], missing: ["三つ葉"], steps: ["切る", "煮る", "とじる"] },
      { title: "味噌汁", minutes: 10, uses: ["豆腐"], missing: [], steps: ["煮る"] },
    ],
    "https://example.com/shopping",
  );
  const carousel = msg.contents as { contents: { footer: { contents: { type: string }[] } }[] };
  assert.equal(carousel.contents.length, 3);
  assert.equal(carousel.contents[0].footer.contents[0].type, "button");
  assert.equal(carousel.contents[1].footer.contents[0].type, "text");
  assert.match(msg.altText, /親子丼、味噌汁/);
});
