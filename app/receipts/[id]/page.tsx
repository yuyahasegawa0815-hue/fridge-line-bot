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
}
interface Receipt {
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
