import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const RecipesSchema = z.object({
  recipes: z
    .array(
      z.object({
        title: z.string().describe("料理名"),
        minutes: z.number().int().describe("調理時間の目安（分）"),
        uses: z.array(z.string()).describe("在庫から使う食材（在庫の名前そのまま）"),
        missing: z.array(z.string()).describe("在庫になく買い足す食材。基本調味料は含めない"),
        steps: z.array(z.string()).describe("作り方。短い文で3〜5手順"),
      }),
    )
    .describe("ちょうど3品"),
});

export type Recipe = z.infer<typeof RecipesSchema>["recipes"][number];

export interface PantryItem {
  name: string;
  daysLeft: number | null;
  remainingPct: number;
}

const SYSTEM = `あなたは夫婦2人暮らしの家庭の献立係です。冷蔵庫の在庫から、今日作れる家庭料理を3品提案します。
- 期限が近い食材（残り日数が少ないもの）をできるだけ使ってください。期限が過ぎたものは使わないでください。
- 残量が少ない食材は少量で済む使い方にしてください。
- 3品は主菜・副菜・汁物などで偏らないようにし、同じ食材ばかりにならないようにしてください。
- 塩・砂糖・醤油・味噌・酢・みりん・酒・油・こしょう・だし・片栗粉・小麦粉は家にある前提で、missing に入れないでください。
- missing は最小限にし、ないと作れないものだけにしてください。
- 2人分の分量感で、平日に30分前後で作れるものを中心にしてください。`;

let client: Anthropic | undefined;

export async function suggestRecipes(items: PantryItem[], request: string): Promise<Recipe[]> {
  client ??= new Anthropic();
  const list = items
    .map((i) => {
      const days = i.daysLeft === null ? "期限不明" : i.daysLeft < 0 ? "期限切れ" : `あと${i.daysLeft}日`;
      const left = i.remainingPct < 100 ? `・残り${i.remainingPct}%` : "";
      return `- ${i.name}（${days}${left}）`;
    })
    .join("\n");
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(RecipesSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `冷蔵庫の在庫：\n${list || "（なし）"}\n\n${request ? `希望：${request}\n\n` : ""}3品提案してください。`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`献立を作れませんでした（stop_reason: ${response.stop_reason}）`);
  }
  return response.parsed_output.recipes.slice(0, 3);
}
