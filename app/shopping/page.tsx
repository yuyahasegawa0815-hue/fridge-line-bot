"use client";
import { useEffect, useState } from "react";
import { api } from "@/src/lib/liff-client";
import { useUi } from "@/src/lib/ui-text";

interface Item {
  id: string;
  name: string;
  reason: string | null;
  done: boolean;
}

export default function ShoppingPage() {
  const ui = useUi();
  const [items, setItems] = useState<Item[] | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  // 画面を開いている間はチェック済みも残して、押し間違いを戻せるようにする。
  const load = () =>
    api<{ items: Item[]; suggestions: string[] }>("/api/shopping")
      .then((r) => {
        setItems((prev) => [...r.items, ...(prev ?? []).filter((p) => p.done && !r.items.some((i) => i.id === p.id))]);
        setSuggestions(r.suggestions);
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function call(method: "POST" | "PATCH", body: object) {
    try {
      setError("");
      await api("/api/shopping", { method, body: JSON.stringify(body) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggle(it: Item) {
    setItems((prev) => prev!.map((p) => (p.id === it.id ? { ...p, done: !p.done } : p)));
    await call("PATCH", { id: it.id, done: !it.done });
  }

  async function add(names: string[]) {
    await call("POST", { names });
    setName("");
  }

  if (!items) return <main className={error ? "error" : "muted"}>{error || ui.loading}</main>;
  const open = items.filter((i) => !i.done).length;
  return (
    <main>
      <div className="fields" style={{ justifyContent: "space-between" }}>
        <h1>{ui.shoppingTitle(open)}</h1>
        <a href="/inventory">{ui.backToInventory}</a>
      </div>
      {error && <p className="error">{error}</p>}
      <form
        className="fields"
        style={{ marginBottom: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) add(name.split(/[、,，\s]+/));
        }}
      >
        <input className="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={ui.shoppingPlaceholder} />
        <button type="submit">{ui.add}</button>
      </form>
      {items.length === 0 && <p className="muted">{ui.emptyShopping}</p>}
      {items.map((it) => (
        <div key={it.id} className={`row ${it.done ? "off" : ""}`}>
          <div className="fields" style={{ justifyContent: "space-between" }}>
            <label className="fields" style={{ flex: 1 }}>
              <input type="checkbox" checked={it.done} onChange={() => toggle(it)} style={{ width: 22, height: 22 }} />
              <span style={{ textDecoration: it.done ? "line-through" : "none" }}>{it.name}</span>
            </label>
            {it.reason && <span className="muted">{ui.reason(it.reason)}</span>}
            {!it.done && (
              <button onClick={() => call("PATCH", { id: it.id, remove: true })} aria-label={ui.remove(it.name)}>
                ×
              </button>
            )}
          </div>
        </div>
      ))}
      {suggestions.length > 0 && (
        <>
          <h1 style={{ marginTop: 20 }}>{ui.recentlyGone}</h1>
          <div className="fields">
            {suggestions.map((s) => (
              <button key={s} onClick={() => add([s])}>
                ＋ {s}
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
