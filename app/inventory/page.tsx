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

const AGO = [
  { label: "今日", days: 0 },
  { label: "昨日", days: 1 },
  { label: "3日前", days: 3 },
  { label: "1週間前", days: 7 },
  { label: "2週間前", days: 14 },
];

function daysAgo(n: number) {
  return new Date(Date.now() + 9 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10);
}

// すでに冷蔵庫にある物や、レシートを忘れた物を1件ずつ足す。
function AddForm({ onAdded }: { onAdded: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [storage, setStorage] = useState("");
  const [remaining, setRemaining] = useState(100);
  const [ago, setAgo] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button className="primary" style={{ marginBottom: 12 }} onClick={() => setOpen(true)}>
        ＋ 食材を追加
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ matched: boolean }>("/api/inventory", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          price_yen: price ? Number(price) : null,
          storage: storage || null,
          remaining_pct: remaining,
          purchased_on: daysAgo(ago),
        }),
      });
      onAdded(r.matched ? `${name.trim()}を追加しました` : `${name.trim()}を追加しました。期限の目安が分からないので、下の一覧で期限を入れてください`);
      setName("");
      setPrice("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="row" style={{ marginBottom: 12 }} onSubmit={submit}>
      <div className="fields">
        <input className="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="品名（例：キャベツ）" autoFocus />
        <input className="num" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} placeholder="金額" />
      </div>
      <div className="fields muted">
        買った日
        {AGO.map((a) => (
          <button type="button" key={a.days} className={ago === a.days ? "on" : ""} onClick={() => setAgo(a.days)}>
            {a.label}
          </button>
        ))}
      </div>
      <div className="fields muted">
        残量
        {LEVELS.map((l) => (
          <button type="button" key={l.pct} className={remaining === l.pct ? "on" : ""} onClick={() => setRemaining(l.pct)}>
            {l.label}
          </button>
        ))}
        <select value={storage} onChange={(e) => setStorage(e.target.value)}>
          <option value="">保存場所：おまかせ</option>
          <option value="fridge">冷蔵</option>
          <option value="freezer">冷凍</option>
          <option value="pantry">常温</option>
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="fields">
        <button type="submit" className="primary" disabled={busy || !name.trim()} style={{ flex: 1, width: "auto" }}>
          {busy ? "追加中…" : "追加"}
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          閉じる
        </button>
      </div>
      <p className="muted">続けて入力できます。期限は品名と買った日から自動で入ります。</p>
    </form>
  );
}

export default function InventoryPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
        <span className="fields">
          <a href="/shopping">買い物リスト</a>
          <a href="/report">食費</a>
        </span>
      </div>
      {error && <p className="error">{error}</p>}
      <AddForm
        onAdded={(msg) => {
          setNotice(msg);
          load();
        }}
      />
      {notice && <p className="muted">{notice}</p>}
      {items.length === 0 && <p className="muted">まだ何も登録されていません。</p>}
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
