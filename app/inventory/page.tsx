"use client";
import { useEffect, useState } from "react";
import { api } from "@/src/lib/liff-client";

interface Item {
  id: string;
  name: string;
  storage: "fridge" | "freezer" | "pantry";
  expires_on: string | null;
  remaining_pct: number;
}

const STORAGE = { fridge: "冷蔵", freezer: "冷凍", pantry: "常温" };
const LEVELS = [
  { pct: 100, label: "たっぷり" },
  { pct: 50, label: "半分" },
  { pct: 25, label: "少し" },
] as const;

function daysLeft(date: string | null) {
  if (!date) return null;
  const today = new Date(new Date().toISOString().slice(0, 10));
  return Math.round((new Date(date).getTime() - today.getTime()) / 86400000);
}

export default function InventoryPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");

  const load = () => api<Item[]>("/api/inventory").then(setItems).catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function patch(body: object) {
    try {
      await api("/api/inventory", { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!items) return <main className={error ? "error" : "muted"}>{error || "読み込み中…"}</main>;
  return (
    <main>
      <div className="fields" style={{ justifyContent: "space-between" }}>
        <h1>冷蔵庫の中身（{items.length}件）</h1>
        <a href="/shopping">買い物リスト →</a>
      </div>
      {error && <p className="error">{error}</p>}
      {items.map((it) => {
        const d = daysLeft(it.expires_on);
        return (
          <div key={it.id} className={`row ${d !== null && d <= 3 ? "low" : ""}`}>
            <div className="fields" style={{ justifyContent: "space-between" }}>
              <strong>{it.name}</strong>
              <span className="muted">
                {STORAGE[it.storage]}・{d === null ? "期限の目安なし" : d < 0 ? `${-d}日過ぎ` : d === 0 ? "今日まで" : `あと${d}日`}
              </span>
            </div>
            <div className="fields">
              {LEVELS.map((l) => (
                <button key={l.pct} className={it.remaining_pct === l.pct ? "on" : ""} onClick={() => patch({ id: it.id, remaining_pct: l.pct })}>
                  {l.label}
                </button>
              ))}
              <button onClick={() => patch({ id: it.id, remaining_pct: 0 })}>使い切った</button>
              <button onClick={() => patch({ id: it.id, remaining_pct: it.remaining_pct, discard: true })}>捨てた</button>
            </div>
            <div className="fields muted">
              期限
              <input type="date" value={it.expires_on ?? ""} onChange={(e) => patch({ id: it.id, expires_on: e.target.value || null })} />
            </div>
          </div>
        );
      })}
    </main>
  );
}
