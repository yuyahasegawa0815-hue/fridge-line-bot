import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

// 日本語以外で入力された食材名（例：chicken breast、우유）を、期限の目安を持つ日本語の食材マスタに結びつける。
const FoodsSchema = z.object({
  foods: z.array(
    z.object({
      input: z.string().describe("入力された名前そのまま"),
      is_food: z.boolean(),
      master_name: z.string().nullable().describe("食材マスタに該当があればその name。なければ null"),
      name_ja: z.string().nullable().describe("一般的な日本語の食材名（master_name がないときに使う）"),
      storage: z.enum(["fridge", "freezer", "pantry"]).nullable().describe("ふつうの保存場所"),
      estimated_days: z
        .object({ fridge: z.number().int().nullable(), freezer: z.number().int().nullable(), pantry: z.number().int().nullable() })
        .nullable()
        .describe("master_name が null の食材だけ、保存場所ごとの家庭での保存目安日数"),
    }),
  ),
});

export type ResolvedFood = z.infer<typeof FoodsSchema>["foods"][number];

const SYSTEM = `冷蔵庫の在庫管理のために、いろいろな言語で書かれた食材名を、日本語の食材マスタに結びつけます。
- 入力の順番どおり、1件ずつ返してください。
- 食材マスタに同じ食材があれば master_name にその name をそのまま入れてください（例：chicken breast → 鶏むね肉）。
- なければ master_name は null にし、name_ja に一般的な日本語名を、estimated_days に保存目安日数を入れてください。
- 食べ物でないものは is_food を false にしてください。`;

let client: Anthropic | undefined;

export async function resolveFoods(names: string[], masterNames: string[]): Promise<ResolvedFood[]> {
  if (!names.length) return [];
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(FoodsSchema) },
    system: [
      { type: "text", text: SYSTEM },
      { type: "text", text: `食材マスタ：${masterNames.join("、")}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: names.map((n) => `- ${n}`).join("\n") }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`食材名を判定できませんでした（stop_reason: ${response.stop_reason}）`);
  }
  return response.parsed_output.foods;
}
