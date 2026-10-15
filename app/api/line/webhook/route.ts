import { validateSignature, type webhook } from "@line/bot-sdk";
import { after } from "next/server";
import { env } from "@/src/lib/env";
import { lineApi, lineBlob, liffUrl } from "@/src/lib/line";
import { ensureMember } from "@/src/lib/household";
import { createDraftReceipt } from "@/src/lib/receipts";
import { addManual, listActive } from "@/src/lib/inventory";

// AI読み取りに数十秒かかることがあるため
export const maxDuration = 60;

const STORAGE_LABEL = { fridge: "冷蔵", freezer: "冷凍", pantry: "常温" } as const;

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
async function reply(token: string | undefined, text: string, groupId?: string) {
  const messages = [{ type: "text" as const, text }];
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
      await reply(event.replyToken, "冷蔵庫の管理を始めます。レシートの写真をこのグループに送ると、在庫に登録します。\n「在庫」で一覧、「追加 いちご 398」で手入力できます。");
      return;
    }
    if (event.type !== "message" || event.source?.type !== "group" || !event.source.userId) return;
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

    const add = text.match(/^追加\s+(\S+)(?:\s+(\d+))?/);
    if (add) {
      const { matched } = await addManual(member, add[1], add[2] ? Number(add[2]) : null);
      return reply(event.replyToken, `${add[1]}を在庫に追加しました${matched ? "" : "（期限の目安が分からないので、一覧画面で期限を入れてください）"}。`);
    }
  } catch (err) {
    console.error(err);
    if ("replyToken" in event) await reply(event.replyToken, "うまく処理できませんでした。少し時間をおいてもう一度送ってください。").catch(() => {});
  }
}
