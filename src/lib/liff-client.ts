"use client";
import liff from "@line/liff";

let ready: Promise<void> | undefined;

// どの世帯の冷蔵庫を開くか。トークのリンクに付いた ?h= を覚えておき、画面を移動しても引き継ぐ。
function householdId(): string {
  const fromUrl = new URLSearchParams(location.search).get("h");
  try {
    if (fromUrl) sessionStorage.setItem("fridgy-h", fromUrl);
    return fromUrl ?? sessionStorage.getItem("fridgy-h") ?? "";
  } catch {
    return fromUrl ?? "";
  }
}

// LIFF を初期化し、ID トークン付きで API を呼ぶ。
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  ready ??= liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! }).then(() => {
    if (!liff.isLoggedIn()) liff.login({ redirectUri: location.href });
  });
  await ready;
  const res = await fetch(path, {
    ...init,
    headers: { ...init.headers, "Content-Type": "application/json", Authorization: `Bearer ${liff.getIDToken()}`, "X-Household": householdId() },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "通信に失敗しました");
  return body as T;
}

export function closeWindow() {
  if (liff.isInClient()) liff.closeWindow();
}
