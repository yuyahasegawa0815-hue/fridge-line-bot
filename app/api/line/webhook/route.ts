import { validateSignature, type messagingApi, type webhook } from "@line/bot-sdk";
import { after } from "next/server";
import { env } from "@/src/lib/env";
import { lineApi, lineBlob, liffUrl, profileLanguage } from "@/src/lib/line";
import { ensureHousehold, ensureMember, setHouseholdLanguage } from "@/src/lib/household";
import { createDraftReceipt } from "@/src/lib/receipts";
import { addManual, applyNoticeAction, listActive } from "@/src/lib/inventory";
import { parseAddLines } from "@/src/lib/add-parse";
import { daysUntil, decodeAction, todayJst } from "@/src/lib/notify";
import { suggestRecipes } from "@/src/lib/recipe-ai";
import { buildRecipes, decodeShop } from "@/src/lib/recipe-message";
import { addShopping, listShopping } from "@/src/lib/shopping";
import { monthlyReports } from "@/src/lib/report-data";
import { reportText } from "@/src/lib/report";
import { isLang, LANG_NAMES, LANGS, normalizeLang, parseCommand, type Lang } from "@/src/lib/i18n";
import { t } from "@/src/lib/messages";

// AI読み取りに数十秒かかることがあるため
export const maxDuration = 60;

const text = (body: string): messagingApi.TextMessage => ({ type: "text", text: body });

// 友だち追加の直後に出す選択肢。ボタンは何度でも押せる。
function setupChoice(lang: Lang): messagingApi.TemplateMessage {
  const msg = t(lang);
  return {
    type: "template",
    altText: msg.setupAlt,
    template: {
      type: "buttons",
      text: msg.setupText,
      actions: [
        { type: "postback", label: msg.setupSolo, data: "setup:solo", displayText: msg.setupSolo },
        { type: "postback", label: msg.setupShare, data: "setup:share", displayText: msg.setupShare },
      ],
    },
  };
}

// 言語を選ぶボタン（メッセージの下に並ぶクイックリプライ）。
const languagePicker = (): messagingApi.QuickReply => ({
  items: LANGS.map((l) => ({
    type: "action",
    action: { type: "postback", label: LANG_NAMES[l], data: `lang:${l}`, displayText: LANG_NAMES[l] },
  })),
});

// 期限の日付（MM-DD）を言語に合わせて短く書く。
function shortDate(date: string, lang: Lang) {
  const [, m, d] = date.split("-").map(Number);
  return lang === "fr" ? `${d}/${m}` : `${m}/${d}`;
}

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

// 挨拶のように、吹き出しを分けて送る（返信は最大5つまで無料でまとめて送れる）。
async function replyMany(token: string | undefined, messages: messagingApi.Message[]) {
  if (!token) return;
  await lineApi().replyMessage({ replyToken: token, messages });
}

// 世帯の言語がまだ決まっていなければ、その人の LINE アプリの言語に合わせる（わからなければ決めずにおく）。
async function detectLanguage(householdId: string, userId: string | undefined): Promise<Lang | null> {
  if (!userId) return null;
  const lang = normalizeLang(await profileLanguage(userId));
  if (lang) await setHouseholdLanguage(householdId, lang);
  return lang;
}

async function handleEvent(event: webhook.Event) {
  let lang: Lang = "ja";
  try {
    const chat = chatOf(event.source);
    if (!chat) return;
    // グループに招待された／友だち追加されたときの挨拶
    if ((event.type === "join" && !chat.personal) || (event.type === "follow" && chat.personal)) {
      const household = await ensureHousehold(chat.chatId);
      lang = household.lang;
      if (household.langUnset && chat.personal) lang = (await detectLanguage(household.id, chat.userId)) ?? lang;
      const msg = t(lang);
      const link = (path: string) => liffUrl(path, household.id, lang);
      if (!chat.personal) {
        // グループでは誰が招待したかわからないので、言語を選べるボタンを添える
        const help = { ...text(msg.help(link)), ...(household.langUnset ? { quickReply: languagePicker() } : {}) };
        await replyMany(event.replyToken, [text(msg.greeting(false)), help]);
        return;
      }
      // 友だち追加のときは、一人で使うか誰かと共有するかを選んでもらう
      await replyMany(event.replyToken, [text(msg.greeting(true)), setupChoice(lang)]);
      return;
    }
    const userId = chat.userId;
    if (!userId) return;
    if (event.type !== "postback" && event.type !== "message") return;

    const member = await ensureMember(chat.chatId, userId);
    lang = member.lang;
    if (member.langUnset) lang = (await detectLanguage(member.household_id, userId)) ?? lang;
    const msg = t(lang);
    const link = (path: string) => liffUrl(path, member.household_id, lang);

    if (event.type === "postback") {
      const data = event.postback.data;
      const chosen = data.match(/^lang:(\w+)$/)?.[1];
      if (chosen && isLang(chosen)) {
        await setHouseholdLanguage(member.household_id, chosen);
        return reply(event.replyToken, t(chosen).languageChanged(LANG_NAMES[chosen]));
      }
      if (data === "setup:share") return reply(event.replyToken, msg.shareGuide);
      if (data === "setup:solo") return reply(event.replyToken, msg.help(link));
      const shop = decodeShop(data);
      if (shop) {
        const added = await addShopping(member.household_id, shop, "献立");
        return reply(event.replyToken, added.length ? msg.addedToShopping(added) : msg.alreadyInShopping);
      }
      const parsed = decodeAction(data);
      if (!parsed) return;
      return reply(event.replyToken, await applyNoticeAction(member.household_id, parsed.itemId, parsed.action, lang));
    }

    const message = event.message;
    if (message.type === "image") {
      const stream = await lineBlob().getMessageContent(message.id);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const receipt = await createDraftReceipt({ ...member, lang }, Buffer.concat(chunks), "image/jpeg");
      // レシートでも冷蔵庫でもない写真には、グループでは反応しない（普通の写真のやりとりを邪魔しない）
      if (!receipt) {
        if (chat.personal) await reply(event.replyToken, msg.notFoodPhoto, chat.chatId);
        return;
      }
      const note = receipt.lowConfidence ? msg.lowConfidence(receipt.lowConfidence) : "";
      const url = link(`/receipts/${receipt.id}`);
      await reply(event.replyToken, receipt.kind === "fridge" ? msg.fridgeRead(receipt.lineCount, note, url) : msg.receiptRead(receipt.lineCount, note, url), chat.chatId);
      return;
    }

    if (message.type !== "text") return;
    const command = parseCommand(message.text);

    switch (command?.cmd) {
      case "inventory": {
        const items = await listActive(member.household_id);
        if (!items.length) return reply(event.replyToken, msg.emptyFridge);
        const lines = items
          .slice(0, 30)
          .map((i) => msg.inventoryLine(i.name, i.remaining_pct, msg.storage[i.storage as keyof typeof msg.storage], i.expires_on ? shortDate(i.expires_on, lang) : null));
        return reply(event.replyToken, msg.inventory(items.length, lines.join("\n"), link("/inventory")));
      }
      case "help":
        return reply(event.replyToken, msg.help(link));
      case "language":
        return reply(event.replyToken, { ...text(msg.languageText), quickReply: languagePicker() });
      case "recipe": {
        const items = await listActive(member.household_id);
        if (!items.length) return reply(event.replyToken, msg.recipeEmpty);
        const today = todayJst();
        const recipes = await suggestRecipes(
          items.map((i) => ({ name: i.name, daysLeft: i.expires_on ? daysUntil(i.expires_on, today) : null, remainingPct: i.remaining_pct })),
          command.arg.slice(0, 100),
          lang,
        );
        return reply(event.replyToken, buildRecipes(recipes, link("/shopping"), lang), chat.chatId);
      }
      case "report": {
        const [cur, prev] = await monthlyReports(member.household_id, todayJst().slice(0, 7), 2);
        return reply(event.replyToken, reportText(cur, prev, msg.thisMonth, link("/report"), lang));
      }
      case "shopping": {
        const list = await listShopping(member.household_id);
        const body = list.length ? msg.list(list.map((i) => i.name)) : msg.shoppingEmpty;
        return reply(event.replyToken, msg.shopping(list.length, body, link("/shopping")));
      }
      case "buy": {
        const added = await addShopping(member.household_id, command.arg.split(/[、,，\s]+/).map((n) => n.slice(0, 40)), null);
        return reply(event.replyToken, added.length ? msg.addedToShopping(added) : msg.alreadyInShopping);
      }
      case "add": {
        const entries = parseAddLines(command.arg);
        if (!entries.length) return reply(event.replyToken, msg.addUsage(link("/inventory")));
        const today = todayJst();
        const unknown: string[] = [];
        for (const e of entries) {
          const purchasedOn = new Date(Date.parse(today) - e.daysAgo * 86_400_000).toISOString().slice(0, 10);
          const { matched } = await addManual({ ...member, lang }, { ...e, purchasedOn });
          if (!matched) unknown.push(e.name);
        }
        const note = unknown.length ? msg.unknownExpiry(msg.join(unknown), link("/inventory")) : "";
        return reply(event.replyToken, msg.added(entries.length, msg.list(entries.map((e) => e.name)), note));
      }
    }

    // 1対1トークは僕だけに話しかけているので、わからない言葉にも返事をする（グループでは会話を邪魔しない）
    if (chat.personal) return reply(event.replyToken, msg.unknownCommand);
  } catch (err) {
    console.error(err);
    if ("replyToken" in event) await reply(event.replyToken, t(lang).error).catch(() => {});
  }
}
