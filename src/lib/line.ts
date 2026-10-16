import { messagingApi } from "@line/bot-sdk";
import { env } from "./env";

let api: messagingApi.MessagingApiClient | undefined;
let blob: messagingApi.MessagingApiBlobClient | undefined;

export function lineApi() {
  api ??= new messagingApi.MessagingApiClient({ channelAccessToken: env.lineChannelAccessToken() });
  return api;
}

export function lineBlob() {
  blob ??= new messagingApi.MessagingApiBlobClient({ channelAccessToken: env.lineChannelAccessToken() });
  return blob;
}

// householdId を付けると、画面がその世帯（グループ／個人トーク）の冷蔵庫を開く。
export function liffUrl(path: string, householdId?: string) {
  const h = householdId ? `${path.includes("?") ? "&" : "?"}h=${householdId}` : "";
  return `https://liff.line.me/${env.liffId()}${path}${h}`;
}

// LIFF から送られた ID トークンを LINE に検証させ、LINE ユーザーIDを返す。
export async function verifyIdToken(idToken: string): Promise<string | null> {
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: env.lineLoginChannelId() }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { sub?: string };
  return body.sub ?? null;
}
