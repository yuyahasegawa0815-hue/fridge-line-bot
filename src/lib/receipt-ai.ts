import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const storage = z.enum(["fridge", "freezer", "pantry"]);

export const ReceiptSchema = z.object({
  kind: z
    .enum(["receipt", "fridge", "other"])
    .describe("receipt：買い物のレシート。fridge：冷蔵庫・冷凍庫・食品棚の中や、並べた食材の写真。other：それ以外"),
  store_name: z.string().nullable(),
  purchased_on: z.string().nullable().describe("YYYY-MM-DD。読めなければ null"),
  total_yen: z.number().int().nullable(),
  lines: z.array(
    z.object({
      raw_text: z.string().describe("レシートは印字された品名そのまま。冷蔵庫の写真は見えた物の短い説明（例：青いパックの牛乳）"),
      is_food: z.boolean().describe("食材・飲料なら true。日用品・袋・ポイントなどは false"),
      food_name: z.string().nullable().describe("一般的な食材名に正規化（例：ﾄﾘﾑﾈ → 鶏むね肉）"),
      master_name: z.string().nullable().describe("食材マスタに該当があればその name。なければ null"),
      quantity: z.number(),
      price_yen: z.number().int().nullable().describe("その行の値引き後の金額（税込）。冷蔵庫の写真では null"),
      remaining_pct: z
        .number()
        .int()
        .nullable()
        .describe("冷蔵庫の写真のときだけ、見た目の残量の目安を 100（たっぷり）・50（半分）・25（少し）のどれかで。レシートでは null"),
      confidence: z.number().describe("0〜1。読み取りや正規化に自信がないほど低く"),
      storage: storage.nullable().describe("買ってきたときの普通の保存場所"),
      estimated_days: z
        .object({ fridge: z.number().int().nullable(), freezer: z.number().int().nullable(), pantry: z.number().int().nullable() })
        .nullable()
        .describe("master_name が null の食材だけ、保存場所ごとの家庭での保存目安日数"),
    }),
  ),
});

export type ExtractedReceipt = z.infer<typeof ReceiptSchema>;

const SYSTEM = `あなたは冷蔵庫の在庫管理のために、写真から食材を読み取ります。写真はレシートか、冷蔵庫などの中身の写真です。まず kind を判定してください。

レシートのとき：
- 値引き・割引の行は直前の商品の金額に反映し、独立した行にしないでください。
- 半角カナの略記は一般的な食材名に直してください。
- 食材マスタに該当するものは master_name にその名前をそのまま入れてください。
- 判読できない行も推測で埋めず、raw_text に見えた文字を入れて confidence を低くしてください。

冷蔵庫などの中身の写真のとき：
- 見えている食材を1種類1行で挙げ、food_name に一般的な食材名を入れてください。同じ物が複数あれば quantity にまとめてください。
- 塩・砂糖・醤油・味噌・マヨネーズ・ケチャップ・ドレッシングなどの調味料は挙げないでください。
- 冷凍庫の中なら storage は freezer、野菜室を含む冷蔵庫なら fridge にしてください。
- 中身が見えない容器や、何か判断できない物は、推測した名前で confidence を低くしてください。
- store_name・purchased_on・total_yen・price_yen は null にしてください。

どちらでもない写真（人物・風景など）は kind を other にし、lines は空にしてください。`;

let client: Anthropic | undefined;

export async function extractReceipt(
  image: { data: string; mediaType: "image/jpeg" | "image/png" },
  masterNames: string[],
): Promise<ExtractedReceipt> {
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // 方針判定で断られたときにサーバー側で別モデルに切り替える
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(ReceiptSchema) },
    system: [
      { type: "text", text: SYSTEM },
      { type: "text", text: `食材マスタ：${masterNames.join("、")}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: "この写真の食材を読み取ってください。" },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`写真を読み取れませんでした（stop_reason: ${response.stop_reason}）`);
  }
  return response.parsed_output;
}
