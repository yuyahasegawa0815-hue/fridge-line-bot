"use client";
import { useEffect, useState } from "react";
import { api } from "@/src/lib/liff-client";
import { useUi } from "@/src/lib/ui-text";

interface MonthReport {
  month: string;
  spendYen: number;
  wasteYen: number;
  wasteRate: number;
  unpricedCount: number;
  byCategory: { category: string; yen: number }[];
  wasted: { name: string; yen: number; remainingPct: number }[];
}


function shift(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div style={{ background: "#f6f8fa", borderRadius: 4, height: 10, flex: 1 }}>
      <div style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color, height: "100%", borderRadius: 4 }} />
    </div>
  );
}

export default function ReportPage() {
  const ui = useUi();
  const yen = ui.yen;
  const [month, setMonth] = useState(() => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 7));
  const [reports, setReports] = useState<MonthReport[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setReports(null);
    api<MonthReport[]>(`/api/report?month=${month}`).then(setReports).catch((e: Error) => setError(e.message));
  }, [month]);

  if (!reports) return <main className={error ? "error" : "muted"}>{error || ui.loading}</main>;
  const [cur, prev] = reports;
  const history = [...reports].reverse();
  const maxSpend = Math.max(...history.map((r) => r.spendYen), 1);
  const maxCat = Math.max(...cur.byCategory.map((c) => c.yen), 1);

  return (
    <main>
      <div className="fields" style={{ justifyContent: "space-between" }}>
        <button onClick={() => setMonth(shift(month, -1))}>‹</button>
        <h1 style={{ margin: 0 }}>{ui.reportTitle(ui.monthLabel(month))}</h1>
        <button onClick={() => setMonth(shift(month, 1))}>›</button>
      </div>

      <div className="fields" style={{ margin: "12px 0", gap: 8 }}>
        <div className="row" style={{ flex: 1, margin: 0 }}>
          <span className="muted">{ui.spend}</span>
          <strong style={{ fontSize: 22 }}>{yen(cur.spendYen)}</strong>
          {prev.spendYen > 0 && <span className="muted">{ui.lastMonth(yen(prev.spendYen))}</span>}
        </div>
        <div className="row" style={{ flex: 1, margin: 0 }}>
          <span className="muted">{ui.waste}</span>
          <strong style={{ fontSize: 22, color: cur.wasteYen ? "#cf222e" : undefined }}>{yen(cur.wasteYen)}</strong>
          <span className="muted">{ui.ofSpend(Math.round(cur.wasteRate * 100))}</span>
        </div>
      </div>
      {cur.unpricedCount > 0 && <p className="muted">{ui.unpriced(cur.unpricedCount)}</p>}

      <h1 style={{ marginTop: 20 }}>{ui.byCategory}</h1>
      {cur.byCategory.length === 0 && <p className="muted">{ui.noPurchases}</p>}
      {cur.byCategory.map((c) => (
        <div key={c.category} className="fields" style={{ marginBottom: 6 }}>
          <span style={{ width: 90 }}>{ui.category(c.category)}</span>
          <Bar value={c.yen} max={maxCat} color="#06c755" />
          <span style={{ width: 80, textAlign: "right" }}>{yen(c.yen)}</span>
        </div>
      ))}

      <h1 style={{ marginTop: 20 }}>{ui.wastedTitle}</h1>
      {cur.wasted.length === 0 && <p className="muted">{ui.noWaste}</p>}
      {cur.wasted.map((w, i) => (
        <div key={i} className="fields" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <span>
            {w.name} <span className="muted">{ui.leftPct(w.remainingPct)}</span>
          </span>
          <span>{yen(w.yen)}</span>
        </div>
      ))}

      <h1 style={{ marginTop: 20 }}>{ui.trend}</h1>
      {history.map((r) => (
        <div key={r.month} className="fields" style={{ marginBottom: 6 }}>
          <span style={{ width: 48 }}>{ui.shortMonth(r.month)}</span>
          <div style={{ flex: 1, display: "grid", gap: 2 }}>
            <Bar value={r.spendYen} max={maxSpend} color="#06c755" />
            <Bar value={r.wasteYen} max={maxSpend} color="#cf222e" />
          </div>
          <span style={{ width: 80, textAlign: "right" }}>{yen(r.spendYen)}</span>
        </div>
      ))}
      <p className="muted">{ui.legend}</p>
      <p>
        <a href="/inventory">{ui.backToInventory}</a>
      </p>
    </main>
  );
}
