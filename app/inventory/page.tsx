"use client";
import { useEffect, useState } from "react";
import { api } from "@/src/lib/liff-client";
import { useUi, type Ui } from "@/src/lib/ui-text";

interface Item {
  id: string;
  name: string;
  storage: "fridge" | "freezer" | "pantry";
  expires_on: string | null;
  remaining_pct: number;
}

const LEVELS = [100, 50, 25] as const;

function daysLeft(date: string | null) {
  if (!date) return null;
  const today = new Date(new Date().toISOString().slice(0, 10));
  return Math.round((new Date(date).getTime() - today.getTime()) / 86400000);
}

const AGO = [0, 1, 3, 7, 14];

function daysAgo(n: number) {
  return new Date(Date.now() + 9 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10);
}

// すでに冷蔵庫にある物や、レシートを忘れた物を1件ずつ足す。
function AddForm({ ui, onAdded }: { ui: Ui; onAdded: (msg: string) => void }) {
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
        {ui.addFood}
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
      onAdded(r.matched ? ui.added(name.trim()) : ui.addedNoExpiry(name.trim()));
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
        <input className="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={ui.namePlaceholder} autoFocus />
        <input className="num" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} placeholder={ui.price} />
      </div>
      <div className="fields muted">
        {ui.boughtOn}
        {AGO.map((a) => (
          <button type="button" key={a} className={ago === a ? "on" : ""} onClick={() => setAgo(a)}>
            {ui.ago[a]}
          </button>
        ))}
      </div>
      <div className="fields muted">
        {ui.remaining}
        {LEVELS.map((l) => (
          <button type="button" key={l} className={remaining === l ? "on" : ""} onClick={() => setRemaining(l)}>
            {ui.levels[l]}
          </button>
        ))}
        <select value={storage} onChange={(e) => setStorage(e.target.value)}>
          <option value="">{ui.storageAuto}</option>
          <option value="fridge">{ui.storage.fridge}</option>
          <option value="freezer">{ui.storage.freezer}</option>
          <option value="pantry">{ui.storage.pantry}</option>
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="fields">
        <button type="submit" className="primary" disabled={busy || !name.trim()} style={{ flex: 1, width: "auto" }}>
          {busy ? ui.adding : ui.add}
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          {ui.close}
        </button>
      </div>
      <p className="muted">{ui.addHint}</p>
    </form>
  );
}

export default function InventoryPage() {
  const ui = useUi();
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

  if (!items) return <main className={error ? "error" : "muted"}>{error || ui.loading}</main>;
  return (
    <main>
      <div className="fields" style={{ justifyContent: "space-between" }}>
        <h1>{ui.inventoryTitle(items.length)}</h1>
        <span className="fields">
          <a href="/shopping">{ui.shoppingLink}</a>
          <a href="/report">{ui.reportLink}</a>
        </span>
      </div>
      {error && <p className="error">{error}</p>}
      <AddForm
        ui={ui}
        onAdded={(msg) => {
          setNotice(msg);
          load();
        }}
      />
      {notice && <p className="muted">{notice}</p>}
      {items.length === 0 && <p className="muted">{ui.emptyInventory}</p>}
      {items.map((it) => {
        const d = daysLeft(it.expires_on);
        return (
          <div key={it.id} className={`row ${d !== null && d <= 3 ? "low" : ""}`}>
            <div className="fields" style={{ justifyContent: "space-between" }}>
              <strong>{it.name}</strong>
              <span className="muted">
                {ui.storage[it.storage]}{ui.lang === "ja" ? "・" : " · "}{d === null ? ui.noExpiry : ui.daysLeft(d)}
              </span>
            </div>
            <div className="fields">
              {LEVELS.map((l) => (
                <button key={l} className={it.remaining_pct === l ? "on" : ""} onClick={() => patch({ id: it.id, remaining_pct: l })}>
                  {ui.levels[l]}
                </button>
              ))}
              <button onClick={() => patch({ id: it.id, remaining_pct: 0 })}>{ui.usedUp}</button>
              <button onClick={() => patch({ id: it.id, remaining_pct: it.remaining_pct, discard: true })}>{ui.discard}</button>
            </div>
            <div className="fields muted">
              {ui.expiry}
              <input type="date" value={it.expires_on ?? ""} onChange={(e) => patch({ id: it.id, expires_on: e.target.value || null })} />
            </div>
          </div>
        );
      })}
    </main>
  );
}
