import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | undefined;

// サーバー専用。service role キーを使うのでブラウザに渡さないこと。
export function db(): SupabaseClient {
  client ??= createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false },
  });
  return client;
}

export const RECEIPT_BUCKET = "receipts";
