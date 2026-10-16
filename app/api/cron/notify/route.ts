import { lineApi, liffUrl } from "@/src/lib/line";
import { dueItemsByHousehold } from "@/src/lib/inventory";
import { buildNotice, selectDue, todayJst, type Slot } from "@/src/lib/notify";
import { householdsWithActivity, monthlyReports } from "@/src/lib/report-data";
import { reportText, shiftMonth } from "@/src/lib/report";

// Vercel Cron から朝と夕方に呼ばれる（vercel.json）。CRON_SECRET で呼び出し元を確認する。
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const slot = new URL(req.url).searchParams.get("slot");
  if (slot !== "morning" && slot !== "evening") return new Response("slot must be morning or evening", { status: 400 });

  const today = todayJst();
  let sent = 0;
  for (const household of await dueItemsByHousehold(today)) {
    const due = selectDue(household.items, today, slot as Slot);
    if (!due.length) continue; // 対象がない回は送らない（無料通数の節約）
    try {
      await lineApi().pushMessage({ to: household.lineGroupId, messages: [buildNotice(due, today, slot as Slot, liffUrl("/inventory", household.id))] });
      sent++;
    } catch (err) {
      console.error("通知の送信に失敗", household.lineGroupId, err);
    }
  }
  // 毎月1日の朝は、先月の食費と廃棄額を振り返る。
  let reports = 0;
  if (slot === "morning" && today.endsWith("-01")) {
    const last = shiftMonth(today.slice(0, 7), -1);
    for (const household of await householdsWithActivity(last)) {
      try {
        const [cur, prev] = await monthlyReports(household.id, last, 2);
        await lineApi().pushMessage({ to: household.lineGroupId, messages: [{ type: "text", text: reportText(cur, prev, "先月の食費", liffUrl("/report", household.id)) }] });
        reports++;
      } catch (err) {
        console.error("月次レポートの送信に失敗", household.lineGroupId, err);
      }
    }
  }
  return Response.json({ slot, today, sent, reports });
}
