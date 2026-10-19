"use client";
import { use, useEffect, useState } from "react";
import { api, closeWindow } from "@/src/lib/liff-client";
import { useUi, type Ui } from "@/src/lib/ui-text";

type Storage = "fridge" | "freezer" | "pantry";
interface Line {
  id?: string;
  raw_text: string;
  food_name: string | null;
  food_master_id?: number | null;
  is_food: boolean;
  quantity: number;
  price_yen: number | null;
  confidence: number;
  storage: Storage | null;
  remaining_pct?: 25 | 50 | 100 | null;
}
interface Receipt {
  kind: "receipt" | "fridge";
  in_stock: string[];
  store_name: string | null;
  purchased_on: string;
  total_yen: number | null;
  status: "draft" | "confirmed";
  receipt_lines: Line[];
}

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ui = useUi();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    api<Receipt>(`/api/receipts/${id}`)
      .then((r) => {
        setReceipt(r);
        setLines(r.receipt_lines);
        setDate(r.purchased_on);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const sum = lines.reduce((s, l) => s + (l.price_yen ?? 0), 0);

  async function submit() {
    setError("");
    try {
      const body = {
        purchased_on: date,
        lines: lines
          .filter((l) => (l.food_name ?? l.raw_text).trim())
          .map((l) => ({
            food_name: (l.food_name ?? l.raw_text).trim(),
            food_master_id: l.food_master_id ?? null,
            is_food: l.is_food,
            quantity: l.quantity,
            price_yen: l.price_yen,
            storage: l.storage ?? "fridge",
          })),
      };
      const res = await api<{ added: number }>(`/api/receipts/${id}`, { method: "POST", body: JSON.stringify(body) });
      setDone(res.added);
      setTimeout(closeWindow, 1500);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error && !receipt) return <main className="error">{error}</main>;
  if (!receipt) return <main className="muted">{ui.loading}</main>;
  if (receipt.status === "confirmed") return <main>{ui.receiptDone}</main>;
  if (done !== null) return <main>{ui.registered(done)}</main>;
  if (receipt.kind === "fridge") return <FridgeScan ui={ui} id={id} receipt={receipt} onDone={setDone} />;

  return (
    <main>
      <h1>{ui.receiptTitle(receipt.store_name)}</h1>
      <p className="muted">{ui.receiptHint}</p>
      <div className="fields" style={{ marginBottom: 12 }}>
        {ui.purchaseDate} <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {lines.map((l, i) => (
        <div key={i} className={`row ${l.confidence < 0.7 ? "low" : ""} ${l.is_food ? "" : "off"}`}>
          <span className="muted">{ui.printed(l.raw_text)}</span>
          <div className="fields">
            <input className="name" value={l.food_name ?? ""} placeholder={ui.itemName} onChange={(e) => update(i, { food_name: e.target.value, food_master_id: null })} />
            <input className="num" type="number" inputMode="numeric" value={l.price_yen ?? ""} placeholder={ui.yenUnit}
              onChange={(e) => update(i, { price_yen: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div className="fields">
            <select value={l.storage ?? "fridge"} onChange={(e) => update(i, { storage: e.target.value as Storage })}>
              <option value="fridge">{ui.storage.fridge}</option>
              <option value="freezer">{ui.storage.freezer}</option>
              <option value="pantry">{ui.storage.pantry}</option>
            </select>
            <button onClick={() => update(i, { is_food: !l.is_food })}>{l.is_food ? ui.exclude : ui.include}</button>
            <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>{ui.delete}</button>
          </div>
        </div>
      ))}
      <button onClick={() => setLines((ls) => [...ls, { raw_text: ui.manualRow, food_name: "", is_food: true, quantity: 1, price_yen: null, confidence: 1, storage: "fridge" }])}>
        {ui.addRow}
      </button>
      <p className="muted">
        {ui.total(ui.yen(sum), receipt.total_yen != null ? ui.yen(receipt.total_yen) : null)}
      </p>
      {error && <p className="error">{error}</p>}
      <button className="primary" onClick={submit}>{ui.register}</button>
    </main>
  );
}

const AGO = [0, 1, 3, 7, 14];
const LEVELS = [100, 50, 25] as const;

function daysAgo(n: number) {
  return new Date(Date.now() + 9 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10);
}

interface ScanRow {
  name: string;
  masterId: number | null;
  hint: string;
  storage: Storage;
  remaining: 25 | 50 | 100;
  ago: number;
  checked: boolean;
  low: boolean;
  inStock: boolean;
}

// 冷蔵庫の写真：見つかった食材から今ある物を選び、写らなかった物は手で足して登録する。
function FridgeScan({ ui, id, receipt, onDone }: { ui: Ui; id: string; receipt: Receipt; onDone: (n: number) => void }) {
  const stock = new Set(receipt.in_stock);
  const [rows, setRows] = useState<ScanRow[]>(() =>
    receipt.receipt_lines
      .filter((l) => l.is_food && (l.food_name ?? l.raw_text).trim())
      .map((l) => {
        const name = (l.food_name ?? l.raw_text).trim();
        const inStock = stock.has(name);
        return {
          name,
          masterId: l.food_master_id ?? null,
          hint: l.raw_text,
          storage: l.storage ?? "fridge",
          remaining: l.remaining_pct ?? 100,
          ago: 3,
          // すでに在庫にある物と、自信のない物は最初はチェックを外しておく
          checked: !inStock && l.confidence >= 0.5,
          low: l.confidence < 0.7,
          inStock,
        };
      }),
  );
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<ScanRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addManual = () => {
    const names = manual.split(/[、,，\n]+/).map((n) => n.trim()).filter(Boolean);
    if (!names.length) return;
    setRows((rs) => [
      ...rs,
      ...names.map((name) => ({ name, masterId: null, hint: "", storage: "fridge" as Storage, remaining: 100 as const, ago: 3, checked: true, low: false, inStock: stock.has(name) })),
    ]);
    setManual("");
  };
  const picked = rows.filter((r) => r.checked && r.name.trim());

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const body = {
        purchased_on: daysAgo(0),
        lines: rows
          .filter((r) => r.name.trim())
          .map((r) => ({
            food_name: r.name.trim(),
            food_master_id: r.masterId,
            is_food: r.checked,
            quantity: 1,
            price_yen: null,
            storage: r.storage,
            remaining_pct: r.remaining,
            purchased_on: daysAgo(r.ago),
          })),
      };
      const res = await api<{ added: number }>(`/api/receipts/${id}`, { method: "POST", body: JSON.stringify(body) });
      onDone(res.added);
      setTimeout(closeWindow, 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>{ui.fridgeTitle(rows.length)}</h1>
      <p className="muted">{ui.fridgeHint}</p>
      {rows.map((r, i) => (
        <div key={i} className={`row ${r.low ? "low" : ""} ${r.checked ? "" : "off"}`}>
          <div className="fields">
            <input type="checkbox" checked={r.checked} onChange={() => update(i, { checked: !r.checked })} style={{ width: 22, height: 22 }} />
            <input className="name" value={r.name} onChange={(e) => update(i, { name: e.target.value, masterId: null })} />
            {r.inStock && <span className="muted">{ui.inStock}</span>}
          </div>
          {r.hint && <span className="muted">{ui.photo(r.hint)}</span>}
          {r.checked && (
            <>
              <div className="fields muted">
                {ui.remaining}
                {LEVELS.map((l) => (
                  <button key={l} className={r.remaining === l ? "on" : ""} onClick={() => update(i, { remaining: l })}>
                    {ui.levels[l]}
                  </button>
                ))}
                <select value={r.storage} onChange={(e) => update(i, { storage: e.target.value as Storage })}>
                  <option value="fridge">{ui.storage.fridge}</option>
                  <option value="freezer">{ui.storage.freezer}</option>
                  <option value="pantry">{ui.storage.pantry}</option>
                </select>
              </div>
              <div className="fields muted">
                {ui.boughtOn}
                {AGO.map((a) => (
                  <button key={a} className={r.ago === a ? "on" : ""} onClick={() => update(i, { ago: a })}>
                    {ui.ago[a]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ))}

      <div className="row">
        <strong>{ui.addMissingTitle}</strong>
        <div className="fields">
          <input className="name" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={ui.missingPlaceholder} />
          <button onClick={addManual}>{ui.add}</button>
        </div>
        <span className="muted">{ui.missingHint}</span>
      </div>

      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy || !picked.length} onClick={submit}>
        {busy ? ui.registering : ui.registerN(picked.length)}
      </button>
    </main>
  );
}
