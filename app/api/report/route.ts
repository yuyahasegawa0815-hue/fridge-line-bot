import { memberFromRequest, unauthorized } from "@/src/lib/liff-auth";
import { monthlyReports } from "@/src/lib/report-data";
import { todayJst } from "@/src/lib/notify";

export async function GET(req: Request) {
  const member = await memberFromRequest(req);
  if (!member) return unauthorized();
  const param = new URL(req.url).searchParams.get("month");
  const month = param && /^\d{4}-\d{2}$/.test(param) ? param : todayJst().slice(0, 7);
  return Response.json(await monthlyReports(member.household_id, month, 6));
}
