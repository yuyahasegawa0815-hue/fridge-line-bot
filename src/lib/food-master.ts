import { db } from "./supabase";
import { resolveFoods } from "./food-ai";
import type { ShelfLife, Storage } from "./expiry";

// 食材マスタ（日本語名・期限の目安日数）。日本語以外の名前は aliases に覚えて、次からは AI を使わずに結びつける。
export interface MasterRow extends ShelfLife {
  id: number;
  name: string;
  aliases: string[];
  default_storage: Storage;
}

const COLS = "id, name, aliases, default_storage, fridge_days, freezer_days, pantry_days";

export async function loadMaster(): Promise<MasterRow[]> {
  const { data, error } = await db().from("food_master").select(COLS).order("id");
  if (error) throw error;
  return data;
}

export function findMaster(master: MasterRow[], name: string): MasterRow | undefined {
  return master.find((m) => m.name === name) ?? master.find((m) => m.aliases.includes(name));
}

export async function findMasterByName(name: string): Promise<MasterRow | null> {
  const byName = await db().from("food_master").select(COLS).eq("name", name).limit(1).maybeSingle();
  if (byName.data) return byName.data;
  return (await db().from("food_master").select(COLS).contains("aliases", [name]).limit(1).maybeSingle()).data;
}

// マスタにない食材を AI の目安日数で追加する（同じ名前があればそれを使う）。
export async function upsertAiMaster(input: {
  name: string;
  storage: Storage | null;
  days: { fridge: number | null; freezer: number | null; pantry: number | null };
}): Promise<MasterRow> {
  const { data, error } = await db()
    .from("food_master")
    .upsert(
      {
        name: input.name,
        category: "その他",
        default_storage: input.storage ?? "fridge",
        fridge_days: input.days.fridge,
        freezer_days: input.days.freezer,
        pantry_days: input.days.pantry,
        source: "ai",
      },
      { onConflict: "name" },
    )
    .select(COLS)
    .single();
  if (error) throw error;
  return data;
}

export async function addAlias(row: MasterRow, alias: string) {
  if (!alias || alias === row.name || row.aliases.includes(alias)) return;
  row.aliases = [...row.aliases, alias];
  const { error } = await db().from("food_master").update({ aliases: row.aliases }).eq("id", row.id);
  if (error) throw error;
}

// 日本語以外の名前をまとめて AI で日本語マスタに結びつけ、名前 → マスタ の対応を返す（結びつかなければ入らない）。
export async function resolveForeignNames(names: string[], master: MasterRow[]): Promise<Map<string, MasterRow>> {
  const result = new Map<string, MasterRow>();
  const unique = [...new Set(names)].slice(0, 30);
  if (!unique.length) return result;
  const resolved = await resolveFoods(unique, master.map((m) => m.name));
  for (const food of resolved) {
    if (!food.is_food || !unique.includes(food.input)) continue;
    let row = food.master_name ? master.find((m) => m.name === food.master_name) : undefined;
    if (!row && food.name_ja) row = findMaster(master, food.name_ja);
    if (!row && food.name_ja && food.estimated_days) {
      row = await upsertAiMaster({ name: food.name_ja, storage: food.storage, days: food.estimated_days });
      master.push(row);
    }
    if (!row) continue;
    await addAlias(row, food.input);
    result.set(food.input, row);
  }
  return result;
}
