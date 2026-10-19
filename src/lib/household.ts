import { db } from "./supabase";
import { isLang, type Lang } from "./i18n";

export interface Member {
  id: string;
  household_id: string;
  lang: Lang;
  // 世帯の言語がまだ決まっていない（自動で合わせる前）
  langUnset: boolean;
}

export interface Household {
  id: string;
  lang: Lang;
  langUnset: boolean;
}

const toLang = (v: unknown) => ({ lang: isLang(v) ? v : ("ja" as Lang), langUnset: !isLang(v) });

// LINEグループ1つ、または1対1トークの相手1人を1世帯（1つの冷蔵庫）として扱う。
// line_group_id にはグループID（C…）か、1対1ならユーザーID（U…）が入る。どちらも通知の送り先になる。
export async function ensureHousehold(chatId: string): Promise<Household> {
  const { data, error } = await db()
    .from("households")
    .upsert({ line_group_id: chatId }, { onConflict: "line_group_id" })
    .select("id, language")
    .single();
  if (error) throw error;
  return { id: data.id, ...toLang(data.language) };
}

export async function setHouseholdLanguage(householdId: string, lang: Lang) {
  const { error } = await db().from("households").update({ language: lang }).eq("id", householdId);
  if (error) throw error;
}

// 話しかけてきた人をその世帯のメンバーに加える。
export async function ensureMember(chatId: string, lineUserId: string): Promise<Member> {
  const household = await ensureHousehold(chatId);
  const { data: member, error: mErr } = await db()
    .from("members")
    .upsert({ household_id: household.id, line_user_id: lineUserId }, { onConflict: "household_id,line_user_id" })
    .select("id, household_id")
    .single();
  if (mErr) throw mErr;
  return { ...member, lang: household.lang, langUnset: household.langUnset };
}

const MEMBER_COLS = "id, household_id, households(language)";
type MemberRow = { id: string; household_id: string; households: { language: string | null } | null };
const toMember = (row: MemberRow | null): Member | null =>
  row && { id: row.id, household_id: row.household_id, ...toLang(row.households?.language) };

// LIFF から来た利用者の世帯。リンクに付いた世帯（?h=）のメンバーならその世帯、
// なければ最初に入った世帯。個人トークとグループの両方で使う人がいるため。
export async function memberByLineUser(lineUserId: string, householdId?: string | null): Promise<Member | null> {
  if (householdId && /^[0-9a-f-]{36}$/i.test(householdId)) {
    const { data } = await db()
      .from("members")
      .select(MEMBER_COLS)
      .eq("line_user_id", lineUserId)
      .eq("household_id", householdId)
      .maybeSingle();
    if (data) return toMember(data as unknown as MemberRow);
  }
  const { data } = await db()
    .from("members")
    .select(MEMBER_COLS)
    .eq("line_user_id", lineUserId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return toMember(data as unknown as MemberRow | null);
}
