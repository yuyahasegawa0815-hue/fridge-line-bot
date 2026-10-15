export type Storage = "fridge" | "freezer" | "pantry";

export interface ShelfLife {
  fridge_days: number | null;
  freezer_days: number | null;
  pantry_days: number | null;
}

// 保存場所ごとの目安日数から期限日（YYYY-MM-DD）を出す。目安がなければ null。
export function estimateExpiry(purchasedOn: string, storage: Storage, life: ShelfLife): string | null {
  const days = { fridge: life.fridge_days, freezer: life.freezer_days, pantry: life.pantry_days }[storage];
  if (days == null) return null;
  const d = new Date(`${purchasedOn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 目安日数が入っている保存場所を優先順に選ぶ（指定がなければマスタの既定値）。
export function pickStorage(preferred: Storage | null, fallback: Storage, life: ShelfLife): Storage {
  const has = (s: Storage) => estimateExpiry("2000-01-01", s, life) !== null;
  if (preferred && has(preferred)) return preferred;
  if (has(fallback)) return fallback;
  return (["fridge", "pantry", "freezer"] as const).find(has) ?? fallback;
}

// 捨てたときのロス額。残量（%）に比例させる。
export function lossYen(priceYen: number | null, remainingPct: number): number {
  if (priceYen == null) return 0;
  return Math.round((priceYen * remainingPct) / 100);
}
