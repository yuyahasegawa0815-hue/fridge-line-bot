import { db } from "./supabase";

export interface Member {
  id: string;
  household_id: string;
}

// LINEグループ1つを1世帯として扱い、話しかけてきた人をメンバーに加える。
export async function ensureMember(lineGroupId: string, lineUserId: string): Promise<Member> {
  const { data: household, error: hErr } = await db()
    .from("households")
    .upsert({ line_group_id: lineGroupId }, { onConflict: "line_group_id" })
    .select("id")
    .single();
  if (hErr) throw hErr;
  const { data: member, error: mErr } = await db()
    .from("members")
    .upsert({ household_id: household.id, line_user_id: lineUserId }, { onConflict: "household_id,line_user_id" })
    .select("id, household_id")
    .single();
  if (mErr) throw mErr;
  return member;
}

// LIFF から来た利用者の世帯。複数グループにいる場合は最初に入った世帯（MVPでは1世帯想定）。
export async function memberByLineUser(lineUserId: string): Promise<Member | null> {
  const { data } = await db()
    .from("members")
    .select("id, household_id")
    .eq("line_user_id", lineUserId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data;
}
