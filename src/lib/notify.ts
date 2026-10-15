import type { messagingApi } from "@line/bot-sdk";

export type Slot = "morning" | "evening";

export interface DueItem {
  id: string;
  name: string;
  expires_on: string;
  remaining_pct: number;
}

const DAY = 86_400_000;

// 日本時間の今日（YYYY-MM-DD）。
export function todayJst(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / DAY);
}

// 朝は期限まで3日以内（過ぎたものも含む）、夕方は今日・明日までのものを通知する。
export function selectDue<T extends DueItem>(items: T[], today: string, slot: Slot): T[] {
  const limit = slot === "morning" ? 3 : 1;
  return items
    .filter((i) => daysUntil(i.expires_on, today) <= limit)
    .sort((a, b) => a.expires_on.localeCompare(b.expires_on));
}

export function dueLabel(days: number): string {
  if (days < 0) return `${-days}日過ぎ`;
  if (days === 0) return "今日まで";
  if (days === 1) return "明日まで";
  return `あと${days}日`;
}

// 通知ボタンの押下内容。LINE の postback data に入れる。
export type ItemAction = "less" | "used_up" | "discard";

export function encodeAction(action: ItemAction, itemId: string): string {
  return new URLSearchParams({ a: action, id: itemId }).toString();
}

export function decodeAction(data: string): { action: ItemAction; itemId: string } | null {
  const p = new URLSearchParams(data);
  const action = p.get("a");
  const itemId = p.get("id");
  if (!itemId || (action !== "less" && action !== "used_up" && action !== "discard")) return null;
  return { action, itemId };
}

// 「減った」で1段階ずつ減らす：たっぷり→半分→少し→なし（使い切り）。
export function stepDown(pct: number): 0 | 25 | 50 {
  return pct > 50 ? 50 : pct > 25 ? 25 : 0;
}

const MAX_ITEMS = 10;

export function buildNotice(items: DueItem[], today: string, slot: Slot, listUrl: string): messagingApi.FlexMessage {
  const shown = items.slice(0, MAX_ITEMS);
  const title = slot === "morning" ? "期限が近い食材があります" : "今夜のうちに使いたい食材";
  const rows: messagingApi.FlexComponent[] = shown.flatMap((item, i) => {
    const left = item.remaining_pct < 100 ? `（残り${item.remaining_pct}%）` : "";
    const button = (label: string, action: ItemAction): messagingApi.FlexButton => ({
      type: "button",
      style: "secondary",
      height: "sm",
      flex: 1,
      action: { type: "postback", label, data: encodeAction(action, item.id), displayText: `${item.name}：${label}` },
    });
    const row: messagingApi.FlexBox = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      margin: i === 0 ? "none" : "lg",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: `${item.name}${left}`, weight: "bold", size: "sm", flex: 3, wrap: true },
            { type: "text", text: dueLabel(daysUntil(item.expires_on, today)), size: "sm", align: "end", flex: 2, color: "#cf222e" },
          ],
        },
        { type: "box", layout: "horizontal", spacing: "sm", contents: [button("減った", "less"), button("使い切った", "used_up"), button("捨てた", "discard")] },
      ],
    };
    return [row];
  });
  const more = items.length > MAX_ITEMS ? `ほか${items.length - MAX_ITEMS}件は一覧で確認できます。` : "";
  return {
    type: "flex",
    altText: `${title}：${shown.map((i) => i.name).join("、")}`,
    contents: {
      type: "bubble",
      header: { type: "box", layout: "vertical", contents: [{ type: "text", text: title, weight: "bold", size: "md" }] },
      body: { type: "box", layout: "vertical", contents: rows },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          ...(more ? [{ type: "text", text: more, size: "xs", color: "#656d76", wrap: true } as messagingApi.FlexText] : []),
          { type: "button", style: "link", height: "sm", action: { type: "uri", label: "一覧を開く", uri: listUrl } },
        ],
      },
    },
  };
}
