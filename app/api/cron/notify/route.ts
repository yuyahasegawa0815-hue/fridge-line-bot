import { lineApi, liffUrl } from "@/src/lib/line";
import { dueItemsByHousehold } from "@/src/lib/inventory";
import { buildNotice, selectDue, todayJst } from "@/src/lib/notify";
import { householdsWithActivity, monthlyReports } from "@/src/lib/report-data";
import { reportText, shiftMonth } from "@/src/lib/report";
import { t } from "@/src/lib/messages";

// Vercel Cron から毎日夕方5時に呼ばれる（vercel.json）。CRON_SECRET で呼び出し元を確認する。
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const today = todayJst();
  let sent = 0;
  for (const household of await dueItemsByHousehold(today)) {
    const due = selectDue(household.items, today);
    if (!due.length) continue; // 対象がない回は送らない（無料通数の節約）
    try {
      await lineApi().pushMessage({ to: household.lineGroupId, messages: [buildNotice(due, today, liffUrl("/inventory", household.id, household.lang), household.lang)] });
      sent++;
    } catch (err) {
      console.error("通知の送信に失敗", household.lineGroupId, err);
    }
  }
  // 毎月1日は、先月の食費と廃棄額を振り返る。
  let reports = 0;
  if (today.endsWith("-01")) {
    const last = shiftMonth(today.slice(0, 7), -1);
    for (const household of await householdsWithActivity(last)) {
      try {
        const [cur, prev] = await monthlyReports(household.id, last, 2);
        await lineApi().pushMessage({ to: household.lineGroupId, messages: [{ type: "text", text: reportText(cur, prev, t(household.lang).lastMonth, liffUrl("/report", household.id, household.lang), household.lang) }] });
        reports++;
      } catch (err) {
        console.error("月次レポートの送信に失敗", household.lineGroupId, err);
      }
    }
  }
  return Response.json({ today, sent, reports });
}
