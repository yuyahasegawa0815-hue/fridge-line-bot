"use client";
import { use, useEffect, useState } from "react";
import { api, closeWindow } from "@/src/lib/liff-client";

type Storage = "fridge" | "freezer" | "pantry";
interface Line {
  id?: string;
  raw_text: string;
  food_name: string | null;
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
  if (!receipt) return <main className="muted">読み込み中…</main>;
  if (receipt.status === "confirmed") return <main>このレシートは登録済みです。</main>;
  if (done !== null) return <main>{done}件を在庫に登録しました。</main>;
  if (receipt.kind === "fridge") return <FridgeScan id={id} receipt={receipt} onDone={setDone} />;

  return (
    <main>
      <h1>{receipt.store_name ?? "レシート"}の確認</h1>
      <p className="muted">
        黄色の行は読み取りに自信がありません。品名と金額を直し、食材でない行は「対象外」にしてください。
      </p>
      <div className="fields" style={{ marginBottom: 12 }}>
        購入日 <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {lines.map((l, i) => (
        <div key={i} className={`row ${l.confidence < 0.7 ? "low" : ""} ${l.is_food ? "" : "off"}`}>
          <span className="muted">印字：{l.raw_text}</span>
          <div className="fields">
            <input className="name" value={l.food_name ?? ""} placeholder="品名" onChange={(e) => update(i, { food_name: e.target.value })} />
            <input className="num" type="number" inputMode="numeric" value={l.price_yen ?? ""} placeholder="円"
              onChange={(e) => update(i, { price_yen: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div className="fields">
            <select value={l.storage ?? "fridge"} onChange={(e) => update(i, { storage: e.target.value as Storage })}>
              <option value="fridge">冷蔵</option>
              <option value="freezer">冷凍</option>
              <option value="pantry">常温</option>
            </select>
            <button onClick={() => update(i, { is_food: !l.is_food })}>{l.is_food ? "対象外にする" : "食材に戻す"}</button>
            <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>削除</button>
          </div>
        </div>
      ))}
      <button onClick={() => setLines((ls) => [...ls, { raw_text: "（手入力）", food_name: "", is_food: true, quantity: 1, price_yen: null, confidence: 1, storage: "fridge" }])}>
        ＋ 行を追加
      </button>
      <p className="muted">
        合計 {sum.toLocaleString()}円{receipt.total_yen != null && ` ／ レシートの合計 ${receipt.total_yen.toLocaleString()}円`}
      </p>
      {error && <p className="error">{error}</p>}
      <button className="primary" onClick={submit}>在庫に登録</button>
    </main>
  );
}

const AGO = [
  { label: "今日", days: 0 },
  { label: "昨日", days: 1 },
  { label: "3日前", days: 3 },
  { label: "1週間前", days: 7 },
  { label: "2週間前", days: 14 },
];
const LEVELS = [
  { pct: 100, label: "たっぷり" },
  { pct: 50, label: "半分" },
  { pct: 25, label: "少し" },
] as const;

function daysAgo(n: number) {
  return new Date(Date.now() + 9 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10);
}

interface ScanRow {
  name: string;
  hint: string;
  storage: Storage;
  remaining: 25 | 50 | 100;
  ago: number;
  checked: boolean;
  low: boolean;
  inStock: boolean;
}

// 冷蔵庫の写真：見つかった食材から今ある物を選び、写らなかった物は手で足して登録する。
function FridgeScan({ id, receipt, onDone }: { id: string; receipt: Receipt; onDone: (n: number) => void }) {
  const stock = new Set(receipt.in_stock);
  const [rows, setRows] = useState<ScanRow[]>(() =>
    receipt.receipt_lines
      .filter((l) => l.is_food && (l.food_name ?? l.raw_text).trim())
      .map((l) => {
        const name = (l.food_name ?? l.raw_text).trim();
        const inStock = stock.has(name);
        return {
          name,
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
    const names = manual.split(/[、,\n]+/).map((n) => n.trim()).filter(Boolean);
    if (!names.length) return;
    setRows((rs) => [
      ...rs,
      ...names.map((name) => ({ name, hint: "手入力", storage: "fridge" as Storage, remaining: 100 as const, ago: 3, checked: true, low: false, inStock: stock.has(name) })),
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
      <h1>冷蔵庫の写真から{rows.length}品</h1>
      <p className="muted">
        今ある物にチェックを入れてください。黄色は写真から自信がない物、「在庫にあり」はもう登録済みの物です。買った日はおおよそで大丈夫です（期限の目安に使います）。
      </p>
      {rows.map((r, i) => (
        <div key={i} className={`row ${r.low ? "low" : ""} ${r.checked ? "" : "off"}`}>
          <div className="fields">
            <input type="checkbox" checked={r.checked} onChange={() => update(i, { checked: !r.checked })} style={{ width: 22, height: 22 }} />
            <input className="name" value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
            {r.inStock && <span className="muted">在庫にあり</span>}
          </div>
          {r.hint !== "手入力" && <span className="muted">写真：{r.hint}</span>}
          {r.checked && (
            <>
              <div className="fields muted">
                残量
                {LEVELS.map((l) => (
                  <button key={l.pct} className={r.remaining === l.pct ? "on" : ""} onClick={() => update(i, { remaining: l.pct })}>
                    {l.label}
                  </button>
                ))}
                <select value={r.storage} onChange={(e) => update(i, { storage: e.target.value as Storage })}>
                  <option value="fridge">冷蔵</option>
                  <option value="freezer">冷凍</option>
                  <option value="pantry">常温</option>
                </select>
              </div>
              <div className="fields muted">
                買った日
                {AGO.map((a) => (
                  <button key={a.days} className={r.ago === a.days ? "on" : ""} onClick={() => update(i, { ago: a.days })}>
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ))}

      <div className="row">
        <strong>写っていない物を追加</strong>
        <div className="fields">
          <input className="name" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="例：卵、ヨーグルト" />
          <button onClick={addManual}>追加</button>
        </div>
        <span className="muted">読点で区切ると、まとめて足せます。</span>
      </div>

      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy || !picked.length} onClick={submit}>
        {busy ? "登録中…" : `${picked.length}件を在庫に登録`}
      </button>
    </main>
  );
}
