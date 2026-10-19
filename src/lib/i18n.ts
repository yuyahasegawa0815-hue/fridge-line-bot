// 対応言語と、トークのコマンドの読み取り。言葉はどの言語で送られても受け付ける（設定と違う言語でも動くように）。

export const LANGS = ["ja", "en", "fr", "ko", "zh"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_NAMES: Record<Lang, string> = { ja: "日本語", en: "English", fr: "Français", ko: "한국어", zh: "中文" };

// AI への指示で使う言語名。
export const LANG_FOR_AI: Record<Lang, string> = { ja: "日本語", en: "英語", fr: "フランス語", ko: "韓国語", zh: "中国語（簡体字）" };

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v);
}

// LINE のプロフィールの言語（例：en-US, zh-Hant, ko）を対応言語にする。対応していない言語は英語にする。
export function normalizeLang(profileLang: string | null | undefined): Lang | null {
  if (!profileLang) return null;
  const base = profileLang.toLowerCase().split(/[-_]/)[0];
  return isLang(base) ? base : "en";
}

export type Command =
  | { cmd: "inventory" | "help" | "report" | "shopping" | "language" }
  | { cmd: "recipe"; arg: string }
  | { cmd: "buy"; arg: string }
  | { cmd: "add"; arg: string };

const words = (...w: string[]) => w.join("|");

const INVENTORY = words("在庫", "inventory", "fridge", "stock", "frigo", "inventaire", "재고", "냉장고", "库存", "庫存", "冰箱");
const REPORT = words("食費", "家計", "spending", "budget", "dépenses", "depenses", "식비", "가계부", "伙食费", "伙食費", "开销", "開銷", "开支");
const SHOPPING = words(
  "買い物リスト", "買い物", "shopping list", "shopping", "list", "liste de courses", "courses", "liste",
  "장보기 목록", "쇼핑 목록", "쇼핑리스트", "장보기", "购物清单", "購物清單", "购物", "購物", "买菜", "買菜",
);
const LANGUAGE = words("言語", "language", "lang", "langue", "언어", "语言", "語言");
const HELP_EXACT = words("help", "how", "aide", "사용법", "도움말", "帮助", "幫助", "用法", "使用方法");
const RECIPE = words("献立", "レシピ", "recipes", "recipe", "menu", "recettes", "recette", "레시피", "메뉴", "식단", "食谱", "食譜", "菜谱", "菜譜", "菜单", "菜單");

export function parseCommand(input: string): Command | null {
  const text = input.trim();
  const exact = (pattern: string) => new RegExp(`^(?:${pattern})$`, "i").test(text);
  if (exact(INVENTORY)) return { cmd: "inventory" };
  if (/^(使い方|ヘルプ|[?？])/.test(text) || exact(HELP_EXACT)) return { cmd: "help" };
  if (exact(REPORT)) return { cmd: "report" };
  if (exact(SHOPPING)) return { cmd: "shopping" };
  if (exact(LANGUAGE)) return { cmd: "language" };
  const recipe = text.match(new RegExp(`^(?:${RECIPE})(?:\\s+(.+))?$`, "is"));
  if (recipe) return { cmd: "recipe", arg: recipe[1]?.trim() ?? "" };
  // 中国語は空白を入れずに「买牛奶」「添加牛奶」と書くことが多いので、空白なしも受け付ける。
  const buy = text.match(/^(?:買う|buy|acheter|구매|사기)\s+(.+)$/is) ?? text.match(/^(?:买|買)\s*(.+)$/s);
  if (buy) return { cmd: "buy", arg: buy[1] };
  const add = text.match(/^(?:追加|add|ajouter|ajout|추가)(?:\s+([\s\S]*))?$/i) ?? text.match(/^(?:添加|加入)\s*([\s\S]*)$/);
  if (add) return { cmd: "add", arg: add[1] ?? "" };
  return null;
}

// 価格表示。日本語は「1,234円」、ほかの言語は「¥1,234」。
export function formatYen(n: number, lang: Lang): string {
  return lang === "ja" ? `${n.toLocaleString("ja-JP")}円` : `¥${n.toLocaleString("en-US")}`;
}

const CATEGORY: Record<string, Record<Exclude<Lang, "ja">, string>> = {
  主食: { en: "Staples", fr: "Féculents", ko: "주식", zh: "主食" },
  "卵・乳製品": { en: "Eggs & dairy", fr: "Œufs et laitages", ko: "달걀·유제품", zh: "蛋和乳制品" },
  大豆製品: { en: "Soy products", fr: "Produits du soja", ko: "콩 제품", zh: "豆制品" },
  果物: { en: "Fruit", fr: "Fruits", ko: "과일", zh: "水果" },
  漬物: { en: "Pickles", fr: "Pickles", ko: "절임", zh: "腌菜" },
  練り物: { en: "Fish cakes", fr: "Pâtés de poisson", ko: "어묵", zh: "鱼糕" },
  肉: { en: "Meat", fr: "Viande", ko: "고기", zh: "肉类" },
  肉加工品: { en: "Processed meat", fr: "Charcuterie", ko: "가공육", zh: "肉制品" },
  野菜: { en: "Vegetables", fr: "Légumes", ko: "채소", zh: "蔬菜" },
  魚: { en: "Fish", fr: "Poisson", ko: "생선", zh: "鱼类" },
  その他: { en: "Other", fr: "Autres", ko: "기타", zh: "其他" },
};

// 食材マスタの種類（日本語）を表示用に訳す。
export function categoryLabel(category: string, lang: Lang): string {
  return lang === "ja" ? category : (CATEGORY[category]?.[lang] ?? category);
}
