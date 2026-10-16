import { db } from "./supabase";

export interface Member {
  id: string;
  household_id: string;
}

// LINEグループ1つ、または1対1トークの相手1人を1世帯（1つの冷蔵庫）として扱う。
// line_group_id にはグループID（C…）か、1対1ならユーザーID（U…）が入る。どちらも通知の送り先になる。
export async function ensureHousehold(chatId: string): Promise<string> {
  const { data, error } = await db()
    .from("households")
    .upsert({ line_group_id: chatId }, { onConflict: "line_group_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// 話しかけてきた人をその世帯のメンバーに加える。
export async function ensureMember(chatId: string, lineUserId: string): Promise<Member> {
  const householdId = await ensureHousehold(chatId);
  const { data: member, error: mErr } = await db()
    .from("members")
    .upsert({ household_id: householdId, line_user_id: lineUserId }, { onConflict: "household_id,line_user_id" })
    .select("id, household_id")
    .single();
  if (mErr) throw mErr;
  return member;
}

// LIFF から来た利用者の世帯。リンクに付いた世帯（?h=）のメンバーならその世帯、
// なければ最初に入った世帯。個人トークとグループの両方で使う人がいるため。
export async function memberByLineUser(lineUserId: string, householdId?: string | null): Promise<Member | null> {
  if (householdId && /^[0-9a-f-]{36}$/i.test(householdId)) {
    const { data } = await db()
      .from("members")
      .select("id, household_id")
      .eq("line_user_id", lineUserId)
      .eq("household_id", householdId)
      .maybeSingle();
    if (data) return data;
  }
  const { data } = await db()
    .from("members")
    .select("id, household_id")
    .eq("line_user_id", lineUserId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data;
}
