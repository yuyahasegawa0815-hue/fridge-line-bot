import type { messagingApi } from "@line/bot-sdk";
import type { Recipe } from "./recipe-ai";
import type { Lang } from "./i18n.ts";
import { t } from "./messages.ts";

// 買い足す食材をポストバックに直接載せる（LINE の上限は300文字）。
const PREFIX = "shop:";
const MAX_DATA = 300;

export function encodeShop(names: string[]): string {
  let data = PREFIX;
  for (const name of names) {
    const next = data === PREFIX ? data + name : `${data}|${name}`;
    if (next.length > MAX_DATA) break;
    data = next;
  }
  return data;
}

export function decodeShop(data: string): string[] | null {
  if (!data.startsWith(PREFIX)) return null;
  const names = data.slice(PREFIX.length).split("|").map((s) => s.trim()).filter(Boolean);
  return names.length ? names : null;
}

const text = (t: string, extra: Partial<messagingApi.FlexText> = {}): messagingApi.FlexText => ({
  type: "text",
  text: t,
  size: "sm",
  wrap: true,
  ...extra,
});

export function buildRecipes(recipes: Recipe[], shoppingUrl: string, lang: Lang = "ja"): messagingApi.FlexMessage {
  const msg = t(lang);
  const bubbles: messagingApi.FlexBubble[] = recipes.map((r) => ({
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [text(r.title, { weight: "bold", size: "md" }), text(msg.minutes(r.minutes), { size: "xs", color: "#656d76" })],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        text(msg.uses(msg.join(r.uses) || msg.none), { color: "#1a7f37" }),
        ...(r.missing.length ? [text(msg.missing(msg.join(r.missing)), { color: "#cf222e" })] : []),
        { type: "separator", margin: "md" },
        ...r.steps.map((s, i) => text(`${i + 1}. ${s}`, { size: "xs", margin: i === 0 ? "md" : "sm" })),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: r.missing.length
        ? [
            {
              type: "button",
              style: "primary",
              color: "#06c755",
              height: "sm",
              action: { type: "postback", label: msg.addMissing, data: encodeShop(r.missing), displayText: msg.addMissingDisplay(r.title) },
            },
          ]
        : [text(msg.allInStock, { size: "xs", color: "#656d76", align: "center" })],
    },
  }));
  bubbles.push({
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      justifyContent: "center",
      contents: [text(msg.shoppingHint, { color: "#656d76" })],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "button", style: "link", height: "sm", action: { type: "uri", label: msg.openShopping, uri: shoppingUrl } }],
    },
  });
  return {
    type: "flex",
    altText: msg.recipeAlt(msg.join(recipes.map((r) => r.title))),
    contents: { type: "carousel", contents: bubbles },
  };
}
