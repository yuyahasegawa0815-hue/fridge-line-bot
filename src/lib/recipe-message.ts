import type { messagingApi } from "@line/bot-sdk";
import type { Recipe } from "./recipe-ai";

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

export function buildRecipes(recipes: Recipe[], shoppingUrl: string): messagingApi.FlexMessage {
  const bubbles: messagingApi.FlexBubble[] = recipes.map((r) => ({
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [text(r.title, { weight: "bold", size: "md" }), text(`約${r.minutes}分`, { size: "xs", color: "#656d76" })],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        text(`使う：${r.uses.join("、") || "なし"}`, { color: "#1a7f37" }),
        ...(r.missing.length ? [text(`買い足す：${r.missing.join("、")}`, { color: "#cf222e" })] : []),
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
              action: { type: "postback", label: "足りない物をリストへ", data: encodeShop(r.missing), displayText: `${r.title}の材料を買い物リストへ` },
            },
          ]
        : [text("今ある物だけで作れるよ✨", { size: "xs", color: "#656d76", align: "center" })],
    },
  }));
  bubbles.push({
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      justifyContent: "center",
      contents: [text("足りない物は買い物リストに入れておくね🛒「買い物」でいつでも見られるよ。", { color: "#656d76" })],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "button", style: "link", height: "sm", action: { type: "uri", label: "買い物リストを開く", uri: shoppingUrl } }],
    },
  });
  return {
    type: "flex",
    altText: `🍳 今日はこんなのどう？${recipes.map((r) => r.title).join("、")}`,
    contents: { type: "carousel", contents: bubbles },
  };
}
