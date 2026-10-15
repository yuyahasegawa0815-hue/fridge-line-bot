import { validateSignature, type messagingApi, type webhook } from "@line/bot-sdk";
import { after } from "next/server";
import { env } from "@/src/lib/env";
import { lineApi, lineBlob, liffUrl } from "@/src/lib/line";
import { ensureMember } from "@/src/lib/household";
import { createDraftReceipt } from "@/src/lib/receipts";
import { addManual, applyNoticeAction, listActive } from "@/src/lib/inventory";
import { parseAddLines } from "@/src/lib/add-parse";
import { daysUntil, decodeAction, todayJst } from "@/src/lib/notify";
import { suggestRecipes } from "@/src/lib/recipe-ai";
import { buildRecipes, decodeShop } from "@/src/lib/recipe-message";
import { addShopping, listShopping } from "@/src/lib/shopping";
import { monthlyReports } from "@/src/lib/report-data";
import { reportText } from "@/src/lib/report";

// AI読み取りに数十秒かかることがあるため
export const maxDuration = 60;

const STORAGE_LABEL = { fridge: "冷蔵", freezer: "冷凍", pantry: "常温" } as const;

const HELP = `Fridgy の使い方

【登録する】
・レシートの写真をこのグループに送る
　→ 読み取り結果の確認画面が届くので、直して「在庫に登録」
・追加 品名 金額：手で登録（例：追加 牛乳 198）
・すでに冷蔵庫にある物や、レシートを忘れた物はまとめて登録できます
　追加
　キャベツ 半分 3日前
　豚こま 400 冷凍
　卵
　（1行に1つ。金額・残量（たっぷり/半分/少し）・冷蔵/冷凍/常温・○日前 は省略できます）
・在庫の画面の「食材を追加」からも登録できます

【見る・記録する】
・在庫：冷蔵庫の中身と、残量や期限を直す画面
・朝8時と夕方5時に、期限が近い食材をお知らせ
　→「減った」「使い切った」「捨てた」ボタンで記録

【献立と買い物】
・献立 または レシピ：在庫から今日の献立を3品（例：レシピ 和食で）
・買い物：買い物リスト
・買う 品名：リストに追加（例：買う 牛乳 卵）

【食費】
・食費：今月の食費と廃棄額（毎月1日に先月分も届きます）`;

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";
  if (!validateSignature(body, env.lineChannelSecret(), signature)) {
    return new Response("invalid signature", { status: 401 });
  }
  const { events } = JSON.parse(body) as webhook.CallbackRequest;
  // LINE には即 200 を返し、重い処理（AI読み取り）はレスポンス後に行う
  after(() => Promise.all(events.map(handleEvent)));
  return new Response("ok");
}

// 返信トークンで返す（無料）。時間がかかって使えなかったときだけグループにプッシュする（月の無料通数を消費）。
async function reply(token: string | undefined, content: string | messagingApi.Message, groupId?: string) {
  const messages = [typeof content === "string" ? { type: "text" as const, text: content } : content];
  try {
    if (!token) throw new Error("no reply token");
    await lineApi().replyMessage({ replyToken: token, messages });
  } catch (err) {
    if (!groupId) throw err;
    await lineApi().pushMessage({ to: groupId, messages });
  }
}

async function handleEvent(event: webhook.Event) {
  try {
    if (event.type === "join") {
      await reply(event.replyToken, "Fridgy（フリッジー）です。冷蔵庫の管理を始めます。レシートの写真をこのグループに送ると、在庫に登録します。\n「使い方」と送ると、できることの一覧が出ます。");
      return;
    }
    if (event.source?.type !== "group" || !event.source.userId) return;

    if (event.type === "postback") {
      const shop = decodeShop(event.postback.data);
      if (shop) {
        const member = await ensureMember(event.source.groupId, event.source.userId);
        const added = await addShopping(member.household_id, shop, "献立");
        return reply(event.replyToken, added.length ? `買い物リストに追加しました：${added.join("、")}` : "もうリストに入っています。");
      }
      const parsed = decodeAction(event.postback.data);
      if (!parsed) return;
      const member = await ensureMember(event.source.groupId, event.source.userId);
      return reply(event.replyToken, await applyNoticeAction(member.household_id, parsed.itemId, parsed.action));
    }

    if (event.type !== "message") return;
    const member = await ensureMember(event.source.groupId, event.source.userId);
    const message = event.message;

    if (message.type === "image") {
      const stream = await lineBlob().getMessageContent(message.id);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const receipt = await createDraftReceipt(member, Buffer.concat(chunks), "image/jpeg");
      const note = receipt.lowConfidence ? `（${receipt.lowConfidence}行は自信がないので確認してください）` : "";
      await reply(event.replyToken, `${receipt.lineCount}行を読み取りました${note}。\n確認して登録：${liffUrl(`/receipts/${receipt.id}`)}`, event.source.groupId);
      return;
    }

    if (message.type !== "text") return;
    const text = message.text.trim();

    if (text === "在庫") {
      const items = await listActive(member.household_id);
      if (!items.length) return reply(event.replyToken, "在庫は空です。");
      const lines = items.slice(0, 30).map((i) => {
        const left = i.remaining_pct < 100 ? `（残り${i.remaining_pct}%）` : "";
        return `・${i.name}${left} ${STORAGE_LABEL[i.storage as keyof typeof STORAGE_LABEL]} ${i.expires_on ? `〜${i.expires_on.slice(5).replace("-", "/")}` : ""}`;
      });
      return reply(event.replyToken, `在庫 ${items.length}件\n${lines.join("\n")}\n\n編集：${liffUrl("/inventory")}`);
    }

    if (/^(使い方|ヘルプ|help|[?？])/i.test(text)) return reply(event.replyToken, HELP);

    const menu = text.match(/^(?:献立|レシピ)(?:\s+(.+))?$/s);
    if (menu) {
      const items = await listActive(member.household_id);
      if (!items.length) return reply(event.replyToken, "在庫が空なので献立を考えられません。レシートの写真を送るか「追加 品名」で登録してください。");
      const today = todayJst();
      const recipes = await suggestRecipes(
        items.map((i) => ({ name: i.name, daysLeft: i.expires_on ? daysUntil(i.expires_on, today) : null, remainingPct: i.remaining_pct })),
        menu[1]?.trim().slice(0, 100) ?? "",
      );
      return reply(event.replyToken, buildRecipes(recipes, liffUrl("/shopping")), event.source.groupId);
    }

    if (text === "食費" || text === "家計") {
      const [cur, prev] = await monthlyReports(member.household_id, todayJst().slice(0, 7), 2);
      return reply(event.replyToken, reportText(cur, prev, "今月の食費", liffUrl("/report")));
    }

    if (text === "買い物" || text === "買い物リスト") {
      const list = await listShopping(member.household_id);
      const body = list.length ? list.map((i) => `・${i.name}`).join("\n") : "リストは空です。";
      return reply(event.replyToken, `買い物リスト ${list.length}件\n${body}\n\n開く：${liffUrl("/shopping")}`);
    }

    const buy = text.match(/^買う\s+(.+)$/s);
    if (buy) {
      const added = await addShopping(member.household_id, buy[1].split(/[、,\s]+/).map((n) => n.slice(0, 40)), null);
      return reply(event.replyToken, added.length ? `買い物リストに追加しました：${added.join("、")}` : "もうリストに入っています。");
    }

    const add = text.match(/^追加(?:\s+([\s\S]*))?$/);
    if (add) {
      const entries = parseAddLines(add[1] ?? "");
      if (!entries.length) {
        return reply(event.replyToken, `「追加」のあとに品名を書いてください。\n例：追加 牛乳 198\n\n複数あるときは1行に1つ：\n追加\nキャベツ 半分 3日前\n豚こま 400 冷凍\n\n画面から登録：${liffUrl("/inventory")}`);
      }
      const today = todayJst();
      const unknown: string[] = [];
      for (const e of entries) {
        const purchasedOn = new Date(Date.parse(today) - e.daysAgo * 86_400_000).toISOString().slice(0, 10);
        const { matched } = await addManual(member, { ...e, purchasedOn });
        if (!matched) unknown.push(e.name);
      }
      const names = entries.map((e) => e.name).join("、");
      const note = unknown.length ? `\n\n${unknown.join("、")}は期限の目安が分からないので、一覧画面で期限を入れてください：${liffUrl("/inventory")}` : "";
      return reply(event.replyToken, `${entries.length}件を在庫に追加しました：${names}${note}`);
    }
  } catch (err) {
    console.error(err);
    if ("replyToken" in event) await reply(event.replyToken, "うまく処理できませんでした。少し時間をおいてもう一度送ってください。").catch(() => {});
  }
}
