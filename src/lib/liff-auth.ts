import { verifyIdToken } from "./line";
import { memberByLineUser, type Member } from "./household";

// LIFF 画面からの API 呼び出しは Authorization: Bearer <IDトークン> で本人確認する。
export async function memberFromRequest(req: Request): Promise<Member | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const lineUserId = await verifyIdToken(token);
  return lineUserId ? memberByLineUser(lineUserId, req.headers.get("x-household")) : null;
}

export const unauthorized = () => Response.json({ error: "まだあなたのことを知らないみたい🙈 Fridgy のいるグループか、Fridgy とのトークで一度なにか送ってから、もう一度開いてね" }, { status: 401 });
