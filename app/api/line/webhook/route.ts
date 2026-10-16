import { validateSignature, type messagingApi, type webhook } from "@line/bot-sdk";
import { after } from "next/server";
import { env } from "@/src/lib/env";
import { lineApi, lineBlob, liffUrl } from "@/src/lib/line";
import { ensureHousehold, ensureMember } from "@/src/lib/household";
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

// 画面へのリンクは世帯ごと（グループと個人トークで冷蔵庫が分かれるため）。
const help = (link: (path: string) => string) => `📖 僕の使い方だよ

【覚えてもらう】
📸 レシートの写真を送ってね
　→ 読み取った内容を確認する画面を送るよ
🧊 冷蔵庫の中の写真もOK
　→ 見つけた食材から、今ある物を選んでね（写らなかった物も足せるよ）
✏️ 手で入れるときは「追加 牛乳 198」
　まとめて入れるなら1行に1つずつ👇
　追加
　キャベツ 半分 3日前
　豚こま 400 冷凍
　卵
　（金額・残量（たっぷり/半分/少し）・冷蔵/冷凍/常温・○日前 は省略OK）
　画面からも入れられるよ：${link("/inventory")}

【見る・記録する】
🥬「在庫」で冷蔵庫の中身を見せるね
　${link("/inventory")}
⏰ 賞味期限の当日、夕方5時にお知らせするよ
　→「減った」「使い切った」「捨てた」ボタンで教えてね

【ごはんと買い物】
🍳「レシピ」（「献立」でもOK）で、今ある物から3品考えるよ
　例：レシピ 和食で／レシピ 15分で
🛒「買い物」で買い物リスト
　${link("/shopping")}
➕「買う 牛乳 卵」でリストに追加

【お金】
💰「食費」で今月の食費と、捨てちゃった金額を出すよ（毎月1日には先月分も届くよ）
　${link("/report")}

困ったら、いつでも「使い方」って送ってね😊`;

const greeting = (where: string) => `はじめまして！冷蔵庫の見張り番、Fridgy（フリッジー）だよ🧊✨

${where}の冷蔵庫の中身を覚えておいて、
「あれ、まだあったっけ？」や「気づいたら期限切れ…」を減らすお手伝いをするね。

これからよろしくね😊`;

// 友だち追加の直後に出す選択肢。ボタンは何度でも押せる。
const SETUP_CHOICE: messagingApi.TemplateMessage = {
  type: "template",
  altText: "1人で使う？それとも誰かと共有する？",
  template: {
    type: "buttons",
    text: "僕をどうやって使う？👇",
    actions: [
      { type: "postback", label: "1人で使う", data: "setup:solo", displayText: "1人で使う" },
      { type: "postback", label: "共有する", data: "setup:share", displayText: "共有する" },
    ],
  },
};

// ボットはLINEグループを作れないので、作り方を案内する。
const SHARE_GUIDE = `👫 家族やパートナーと一緒に使うなら、LINEグループに僕を招待してね！

1️⃣ LINEのホーム画面で「グループ作成」をタップ
2️⃣ 一緒に使う人と、僕（Fridgy）を選んでグループを作る
3️⃣ 僕がグループに入ったら、そこで挨拶と使い方を送るね

もうグループがあるなら、そのグループの「招待」から僕を追加するだけでOK🙆

※グループの冷蔵庫は、このトークとは別に管理するよ。みんなで使うときはグループに写真やメッセージを送ってね📸`;

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
async function reply(token: string | undefined, content: string | messagingApi.Message, chatId?: string) {
  const messages = [typeof content === "string" ? { type: "text" as const, text: content } : content];
  try {
    if (!token) throw new Error("no reply token");
    await lineApi().replyMessage({ replyToken: token, messages });
  } catch (err) {
    if (!chatId) throw err;
    await lineApi().pushMessage({ to: chatId, messages });
  }
}

// グループならグループ、1対1トークなら本人を1世帯（1つの冷蔵庫）として扱う。
function chatOf(source: webhook.Source | undefined) {
  if (source?.type === "group") return { chatId: source.groupId, userId: source.userId, personal: false };
  if (source?.type === "user" && source.userId) return { chatId: source.userId, userId: source.userId, personal: true };
  return null;
}

// 参加したときの挨拶のように、吹き出しを分けて送る（返信は最大5つまで無料でまとめて送れる）。
async function replyMany(token: string | undefined, texts: string[]) {
  if (!token) return;
  await lineApi().replyMessage({ replyToken: token, messages: texts.map((text) => ({ type: "text" as const, text })) });
}

async function handleEvent(event: webhook.Event) {
  try {
    const chat = chatOf(event.source);
    if (!chat) return;
    // グループに招待された／友だち追加されたときの挨拶
    if ((event.type === "join" && !chat.personal) || (event.type === "follow" && chat.personal)) {
      const householdId = await ensureHousehold(chat.chatId);
      const link = (path: string) => liffUrl(path, householdId);
      if (!chat.personal) {
        await replyMany(event.replyToken, [greeting("このグループ"), help(link)]);
        return;
      }
      // 友だち追加のときは、一人で使うか誰かと共有するかを選んでもらう
      await lineApi().replyMessage({ replyToken: event.replyToken!, messages: [{ type: "text", text: greeting("あなたやご家族") }, SETUP_CHOICE] });
      return;
    }
    const userId = chat.userId;
    if (!userId) return;

    if (event.type === "postback" && event.postback.data.startsWith("setup:")) {
      if (event.postback.data === "setup:share") return reply(event.replyToken, SHARE_GUIDE);
      const member = await ensureMember(chat.chatId, userId);
      return reply(event.replyToken, help((path) => liffUrl(path, member.household_id)));
    }

    if (event.type === "postback") {
      const shop = decodeShop(event.postback.data);
      if (shop) {
        const member = await ensureMember(chat.chatId, userId);
        const added = await addShopping(member.household_id, shop, "献立");
        return reply(event.replyToken, added.length ? `🛒 買い物リストに入れたよ！\n${added.map((n) => `・${n}`).join("\n")}` : "それはもうリストに入ってるよ👌");
      }
      const parsed = decodeAction(event.postback.data);
      if (!parsed) return;
      const member = await ensureMember(chat.chatId, userId);
      return reply(event.replyToken, await applyNoticeAction(member.household_id, parsed.itemId, parsed.action));
    }

    if (event.type !== "message") return;
    const member = await ensureMember(chat.chatId, userId);
    const message = event.message;
    const link = (path: string) => liffUrl(path, member.household_id);

    if (message.type === "image") {
      const stream = await lineBlob().getMessageContent(message.id);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const receipt = await createDraftReceipt(member, Buffer.concat(chunks), "image/jpeg");
      // レシートでも冷蔵庫でもない写真には、グループでは反応しない（普通の写真のやりとりを邪魔しない）
      if (!receipt) {
        if (chat.personal) await reply(event.replyToken, "この写真はレシートでも冷蔵庫の中でもなさそうだよ🤔\nレシートか冷蔵庫の中を撮って送ってね📸", chat.chatId);
        return;
      }
      const note = receipt.lowConfidence ? `\n（${receipt.lowConfidence}件はちょっと自信がないから、確認してね🙏）` : "";
      const msg =
        receipt.kind === "fridge"
          ? `🧊 冷蔵庫の中から${receipt.lineCount}品見つけたよ！${note}\n今ある物にチェックして登録してね👇\n${link(`/receipts/${receipt.id}`)}`
          : `📸 レシートを読んだよ！${receipt.lineCount}行あったよ${note}\n合ってるか見て、登録してね👇\n${link(`/receipts/${receipt.id}`)}`;
      await reply(event.replyToken, msg, chat.chatId);
      return;
    }

    if (message.type !== "text") return;
    const text = message.text.trim();

    if (text === "在庫") {
      const items = await listActive(member.household_id);
      if (!items.length) return reply(event.replyToken, "冷蔵庫はまだ空っぽだよ🫙\nレシートか冷蔵庫の写真を送ってくれたら覚えるね📸");
      const lines = items.slice(0, 30).map((i) => {
        const left = i.remaining_pct < 100 ? `（残り${i.remaining_pct}%）` : "";
        return `・${i.name}${left} ${STORAGE_LABEL[i.storage as keyof typeof STORAGE_LABEL]} ${i.expires_on ? `〜${i.expires_on.slice(5).replace("-", "/")}` : ""}`;
      });
      return reply(event.replyToken, `🥬 今の冷蔵庫の中身だよ（${items.length}件）\n${lines.join("\n")}\n\n残量や期限を直すときはこちら👇\n${link("/inventory")}`);
    }

    if (/^(使い方|ヘルプ|help|[?？])/i.test(text)) return reply(event.replyToken, help(link));

    const menu = text.match(/^(?:献立|レシピ)(?:\s+(.+))?$/s);
    if (menu) {
      const items = await listActive(member.household_id);
      if (!items.length) return reply(event.replyToken, "冷蔵庫が空っぽで、献立が考えられないよ😢\nレシートか冷蔵庫の写真を送るか、「追加 品名」で教えてね！");
      const today = todayJst();
      const recipes = await suggestRecipes(
        items.map((i) => ({ name: i.name, daysLeft: i.expires_on ? daysUntil(i.expires_on, today) : null, remainingPct: i.remaining_pct })),
        menu[1]?.trim().slice(0, 100) ?? "",
      );
      return reply(event.replyToken, buildRecipes(recipes, link("/shopping")), chat.chatId);
    }

    if (text === "食費" || text === "家計") {
      const [cur, prev] = await monthlyReports(member.household_id, todayJst().slice(0, 7), 2);
      return reply(event.replyToken, reportText(cur, prev, "今月の食費", link("/report")));
    }

    if (text === "買い物" || text === "買い物リスト") {
      const list = await listShopping(member.household_id);
      const body = list.length ? list.map((i) => `・${i.name}`).join("\n") : "今は買う物なしだよ✨";
      return reply(event.replyToken, `🛒 買い物リスト（${list.length}件）\n${body}\n\nチェックや追加はこちら👇\n${link("/shopping")}`);
    }

    const buy = text.match(/^買う\s+(.+)$/s);
    if (buy) {
      const added = await addShopping(member.household_id, buy[1].split(/[、,\s]+/).map((n) => n.slice(0, 40)), null);
      return reply(event.replyToken, added.length ? `🛒 買い物リストに入れたよ！\n${added.map((n) => `・${n}`).join("\n")}` : "それはもうリストに入ってるよ👌");
    }

    const add = text.match(/^追加(?:\s+([\s\S]*))?$/);
    if (add) {
      const entries = parseAddLines(add[1] ?? "");
      if (!entries.length) {
        return reply(event.replyToken, `「追加」のあとに品名を書いてね✏️\n例：追加 牛乳 198\n\nいくつかあるときは1行に1つずつ👇\n追加\nキャベツ 半分 3日前\n豚こま 400 冷凍\n\n画面からも入れられるよ：${link("/inventory")}`);
      }
      const today = todayJst();
      const unknown: string[] = [];
      for (const e of entries) {
        const purchasedOn = new Date(Date.parse(today) - e.daysAgo * 86_400_000).toISOString().slice(0, 10);
        const { matched } = await addManual(member, { ...e, purchasedOn });
        if (!matched) unknown.push(e.name);
      }
      const names = entries.map((e) => `・${e.name}`).join("\n");
      const note = unknown.length ? `\n\n${unknown.join("、")}は期限の目安がわからなかったよ🤔 よかったら期限を入れてね👇\n${link("/inventory")}` : "";
      return reply(event.replyToken, `✅ ${entries.length}件覚えたよ！\n${names}${note}`);
    }

    // 1対1トークは僕だけに話しかけているので、わからない言葉にも返事をする（グループでは会話を邪魔しない）
    if (chat.personal) return reply(event.replyToken, "ごめんね、その言葉はまだわからないんだ🙏\n「使い方」って送ってくれたら、できることを教えるね😊");
  } catch (err) {
    console.error(err);
    if ("replyToken" in event) await reply(event.replyToken, "ごめんね、うまくできなかったよ💦\n少し時間をおいて、もう一度送ってみてね🙏").catch(() => {});
  }
}
