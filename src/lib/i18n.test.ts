import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryLabel, formatYen, normalizeLang, parseCommand } from "./i18n.ts";
import { t } from "./messages.ts";

test("LINE の言語設定を対応言語にする", () => {
  assert.equal(normalizeLang("ja"), "ja");
  assert.equal(normalizeLang("en-US"), "en");
  assert.equal(normalizeLang("zh-Hant"), "zh");
  assert.equal(normalizeLang("ko"), "ko");
  assert.equal(normalizeLang("th"), "en");
  assert.equal(normalizeLang(undefined), null);
});

test("コマンドはどの言語でも受け付ける", () => {
  for (const w of ["在庫", "fridge", "Inventory", "frigo", "재고", "库存"]) assert.deepEqual(parseCommand(w), { cmd: "inventory" });
  for (const w of ["使い方", "help", "aide", "사용법", "帮助", "？"]) assert.deepEqual(parseCommand(w), { cmd: "help" });
  for (const w of ["食費", "spending", "dépenses", "식비", "伙食费"]) assert.deepEqual(parseCommand(w), { cmd: "report" });
  for (const w of ["買い物", "shopping", "courses", "장보기", "购物", "买菜"]) assert.deepEqual(parseCommand(w), { cmd: "shopping" });
  for (const w of ["言語", "language", "langue", "언어", "语言"]) assert.deepEqual(parseCommand(w), { cmd: "language" });
  assert.deepEqual(parseCommand("レシピ 和食で"), { cmd: "recipe", arg: "和食で" });
  assert.deepEqual(parseCommand("recipe"), { cmd: "recipe", arg: "" });
  assert.deepEqual(parseCommand("Recette italienne"), { cmd: "recipe", arg: "italienne" });
  assert.deepEqual(parseCommand("buy milk eggs"), { cmd: "buy", arg: "milk eggs" });
  assert.deepEqual(parseCommand("买牛奶"), { cmd: "buy", arg: "牛奶" });
  assert.deepEqual(parseCommand("追加\nキャベツ 半分"), { cmd: "add", arg: "キャベツ 半分" });
  assert.deepEqual(parseCommand("add"), { cmd: "add", arg: "" });
  assert.deepEqual(parseCommand("添加牛奶"), { cmd: "add", arg: "牛奶" });
});

test("ふつうの会話はコマンドにしない", () => {
  for (const w of ["今日なに食べる？", "listen", "addition", "在庫あるかな", "buyer"]) assert.equal(parseCommand(w), null);
});

test("使い方に書いたコマンドが実際に通じる", () => {
  const link = (p: string) => `https://x${p}`;
  for (const lang of ["ja", "en", "fr", "ko", "zh"] as const) {
    const help = t(lang).help(link);
    const quoted = [...help.matchAll(/[「"«]\s?([^」"»]+?)\s?[」"»]/g)].map((m) => m[1]);
    const commands = quoted.filter((q) => parseCommand(q));
    assert.ok(commands.length >= 6, `${lang}: ${quoted.join(" / ")}`);
  }
});

test("金額と種類の表示", () => {
  assert.equal(formatYen(1234, "ja"), "1,234円");
  assert.equal(formatYen(1234, "fr"), "¥1,234");
  assert.equal(categoryLabel("野菜", "ko"), "채소");
  assert.equal(categoryLabel("野菜", "ja"), "野菜");
  assert.equal(categoryLabel("謎", "en"), "謎");
});

test("通知・レシピ・食費のメッセージが言語に合わせて変わる", async () => {
  const { buildNotice } = await import("./notify.ts");
  const { buildRecipes } = await import("./recipe-message.ts");
  const { reportText } = await import("./report.ts");
  const notice = buildNotice([{ id: "a", name: "milk", expires_on: "2026-10-19", remaining_pct: 50 }], "2026-10-19", "https://x", "en");
  assert.match(notice.altText, /^🌙 Some food expires today/);
  assert.match(JSON.stringify(notice), /Threw away/);
  assert.match(JSON.stringify(notice), /\(50% left\)/);

  const recipes = buildRecipes([{ title: "된장찌개", minutes: 20, uses: ["두부"], missing: ["애호박"], steps: ["끓인다"] }], "https://x", "ko");
  assert.match(JSON.stringify(recipes), /약 20분/);
  assert.match(JSON.stringify(recipes), /살 것: 애호박/);

  const month = { month: "2026-10", spendYen: 12000, wasteYen: 600, wasteRate: 0.05, unpricedCount: 0, byCategory: [], wasted: [{ name: "lait", yen: 600, remainingPct: 50 }] };
  const text = reportText(month, { ...month, spendYen: 10000 }, t("fr").thisMonth, "https://x", "fr");
  assert.match(text, /octobre/);
  assert.match(text, /💰 Dépensé : ¥12,000 \(\+¥2,000 par rapport au mois dernier\)/);
  assert.match(text, /Jeté : lait/);
});
