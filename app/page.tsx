"use client";
import { useEffect, useState } from "react";
import liff from "@line/liff";

// LIFF の URL（liff.line.me/{id}/receipts/…）はまずエンドポイントのルートに
// ?liff.state=/receipts/… 付きで開かれる。liff.init がそのパスへ転送する。
export default function Home() {
  const [error, setError] = useState("");
  useEffect(() => {
    const hasState = new URLSearchParams(location.search).has("liff.state");
    liff
      .init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! })
      .then(() => {
        if (!hasState) location.replace("/inventory");
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  return <main style={{ padding: 24 }}>{error ? `Error: ${error}` : "…"}</main>;
}
