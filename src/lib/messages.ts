// Fridgy がトークで話す言葉。言語ごとに同じ項目をそろえる（型で抜けを防ぐ）。
import { formatYen, LANG_NAMES, type Lang } from "./i18n.ts";

type Link = (path: string) => string;
type StorageKey = "fridge" | "freezer" | "pantry";

export interface Messages {
  greeting: (personal: boolean) => string;
  help: (link: Link) => string;
  setupAlt: string;
  setupText: string;
  setupSolo: string;
  setupShare: string;
  shareGuide: string;
  storage: Record<StorageKey, string>;
  list: (names: string[]) => string;
  join: (names: string[]) => string;
  addedToShopping: (names: string[]) => string;
  alreadyInShopping: string;
  notFoodPhoto: string;
  lowConfidence: (n: number) => string;
  fridgeRead: (n: number, note: string, url: string) => string;
  receiptRead: (n: number, note: string, url: string) => string;
  emptyFridge: string;
  inventoryLine: (name: string, pct: number, storage: string, expires: string | null) => string;
  inventory: (count: number, lines: string, url: string) => string;
  recipeEmpty: string;
  shopping: (count: number, list: string, url: string) => string;
  shoppingEmpty: string;
  addUsage: (url: string) => string;
  added: (count: number, names: string, note: string) => string;
  unknownExpiry: (names: string, url: string) => string;
  unknownCommand: string;
  error: string;
  // 期限のお知らせ
  noticeTitle: string;
  noticeDue: string;
  noticeLess: string;
  noticeUsedUp: string;
  noticeDiscard: string;
  noticeMore: (n: number) => string;
  noticeOpen: string;
  left: (pct: number) => string;
  actionNotFound: string;
  actionAlready: (name: string) => string;
  actionDiscarded: (name: string, loss: string) => string;
  actionUsedUp: (name: string) => string;
  actionRemaining: (name: string, pct: number) => string;
  // レシピ
  minutes: (n: number) => string;
  uses: (names: string) => string;
  none: string;
  missing: (names: string) => string;
  addMissing: string;
  addMissingDisplay: (title: string) => string;
  allInStock: string;
  shoppingHint: string;
  openShopping: string;
  recipeAlt: (titles: string) => string;
  // 食費
  thisMonth: string;
  lastMonth: string;
  reportHeader: (title: string, month: number) => string;
  spend: string;
  waste: string;
  ofSpend: (pct: number) => string;
  sameAsLast: string;
  vsLast: (sign: string, amount: string) => string;
  wastedItems: (names: string, more: boolean) => string;
  zeroWaste: string;
  unpriced: (n: number) => string;
  details: (url: string) => string;
  // 言語
  languageText: string;
  languageChanged: (name: string) => string;
}

const ja: Messages = {
  greeting: (personal) => `はじめまして！冷蔵庫の見張り番、Fridgy（フリッジー）だよ🧊✨

${personal ? "あなたやご家族" : "このグループ"}の冷蔵庫の中身を覚えておいて、
「あれ、まだあったっけ？」や「気づいたら期限切れ…」を減らすお手伝いをするね。

これからよろしくね😊`,
  help: (link) => `📖 僕の使い方だよ

【覚えてもらう】
📸 レシートの写真を送ってね
　→ 読み取った内容を確認する画面を送るよ
🧊 冷蔵庫の中の写真もOK
　→ 見つけた食材から、今ある物を選んでね（写らなかった物も足せるよ）
✏️ 手で入れるときは「追加 牛乳 198」
　まとめて入れるなら1行に1つずつ👇
　追加
　キャベツ 半分 3日前
　豚こま 400 冷凍
　卵
　（金額・残量（たっぷり/半分/少し）・冷蔵/冷凍/常温・○日前 は省略OK）
　画面からも入れられるよ：${link("/inventory")}

【見る・記録する】
🥬「在庫」で冷蔵庫の中身を見せるね
　${link("/inventory")}
⏰ 賞味期限の当日、夕方5時にお知らせするよ
　→「減った」「使い切った」「捨てた」ボタンで教えてね

【ごはんと買い物】
🍳「レシピ」（「献立」でもOK）で、今ある物から3品考えるよ
　例：レシピ 和食で／レシピ 15分で
🛒「買い物」で買い物リスト
　${link("/shopping")}
➕「買う 牛乳 卵」でリストに追加

【お金】
💰「食費」で今月の食費と、捨てちゃった金額を出すよ（毎月1日には先月分も届くよ）
　${link("/report")}

🌐「言語」で話す言葉を変えられるよ（English / Français / 한국어 / 中文）

困ったら、いつでも「使い方」って送ってね😊`,
  setupAlt: "1人で使う？それとも誰かと共有する？",
  setupText: "僕をどうやって使う？👇",
  setupSolo: "1人で使う",
  setupShare: "共有する",
  shareGuide: `👫 家族やパートナーと一緒に使うなら、LINEグループに僕を招待してね！

1️⃣ LINEのホーム画面で「グループ作成」をタップ
2️⃣ 一緒に使う人と、僕（Fridgy）を選んでグループを作る
3️⃣ 僕がグループに入ったら、そこで挨拶と使い方を送るね

もうグループがあるなら、そのグループの「招待」から僕を追加するだけでOK🙆

※グループの冷蔵庫は、このトークとは別に管理するよ。みんなで使うときはグループに写真やメッセージを送ってね📸`,
  storage: { fridge: "冷蔵", freezer: "冷凍", pantry: "常温" },
  list: (names) => names.map((n) => `・${n}`).join("\n"),
  join: (names) => names.join("、"),
  addedToShopping: (names) => `🛒 買い物リストに入れたよ！\n${ja.list(names)}`,
  alreadyInShopping: "それはもうリストに入ってるよ👌",
  notFoodPhoto: "この写真はレシートでも冷蔵庫の中でもなさそうだよ🤔\nレシートか冷蔵庫の中を撮って送ってね📸",
  lowConfidence: (n) => `\n（${n}件はちょっと自信がないから、確認してね🙏）`,
  fridgeRead: (n, note, url) => `🧊 冷蔵庫の中から${n}品見つけたよ！${note}\n今ある物にチェックして登録してね👇\n${url}`,
  receiptRead: (n, note, url) => `📸 レシートを読んだよ！${n}行あったよ${note}\n合ってるか見て、登録してね👇\n${url}`,
  emptyFridge: "冷蔵庫はまだ空っぽだよ🫙\nレシートか冷蔵庫の写真を送ってくれたら覚えるね📸",
  inventoryLine: (name, pct, storage, expires) => `・${name}${pct < 100 ? `（残り${pct}%）` : ""} ${storage} ${expires ? `〜${expires}` : ""}`,
  inventory: (count, lines, url) => `🥬 今の冷蔵庫の中身だよ（${count}件）\n${lines}\n\n残量や期限を直すときはこちら👇\n${url}`,
  recipeEmpty: "冷蔵庫が空っぽで、献立が考えられないよ😢\nレシートか冷蔵庫の写真を送るか、「追加 品名」で教えてね！",
  shopping: (count, list, url) => `🛒 買い物リスト（${count}件）\n${list}\n\nチェックや追加はこちら👇\n${url}`,
  shoppingEmpty: "今は買う物なしだよ✨",
  addUsage: (url) => `「追加」のあとに品名を書いてね✏️\n例：追加 牛乳 198\n\nいくつかあるときは1行に1つずつ👇\n追加\nキャベツ 半分 3日前\n豚こま 400 冷凍\n\n画面からも入れられるよ：${url}`,
  added: (count, names, note) => `✅ ${count}件覚えたよ！\n${names}${note}`,
  unknownExpiry: (names, url) => `\n\n${names}は期限の目安がわからなかったよ🤔 よかったら期限を入れてね👇\n${url}`,
  unknownCommand: "ごめんね、その言葉はまだわからないんだ🙏\n「使い方」って送ってくれたら、できることを教えるね😊",
  error: "ごめんね、うまくできなかったよ💦\n少し時間をおいて、もう一度送ってみてね🙏",
  noticeTitle: "🌙 今日が期限の食材があるよ！今夜使ってね",
  noticeDue: "今日まで",
  noticeLess: "減った",
  noticeUsedUp: "使い切った",
  noticeDiscard: "捨てた",
  noticeMore: (n) => `ほかに${n}件あるよ。一覧で見てね👀`,
  noticeOpen: "冷蔵庫の中身を見る",
  left: (pct) => `（残り${pct}%）`,
  actionNotFound: "あれ、その食材が見つからなかったよ🤔",
  actionAlready: (name) => `${name}はもう記録してあるよ👌`,
  actionDiscarded: (name, loss) => `${name}は「捨てた」で記録したよ${loss ? `（ロス ${loss}）` : ""}。次はおいしく食べきろうね🍀`,
  actionUsedUp: (name) => `${name}、使い切ったね！ナイス👏`,
  actionRemaining: (name, pct) => `${name}の残りを${pct}%にしたよ📝`,
  minutes: (n) => `約${n}分`,
  uses: (names) => `使う：${names}`,
  none: "なし",
  missing: (names) => `買い足す：${names}`,
  addMissing: "足りない物をリストへ",
  addMissingDisplay: (title) => `${title}の材料を買い物リストへ`,
  allInStock: "今ある物だけで作れるよ✨",
  shoppingHint: "足りない物は買い物リストに入れておくね🛒「買い物」でいつでも見られるよ。",
  openShopping: "買い物リストを開く",
  recipeAlt: (titles) => `🍳 今日はこんなのどう？${titles}`,
  thisMonth: "今月の食費",
  lastMonth: "先月の食費",
  reportHeader: (title, month) => `📊 ${title}（${month}月）だよ`,
  spend: "💰 食費：",
  waste: "🗑️ 廃棄：",
  ofSpend: (pct) => `（食費の${pct}%）`,
  sameAsLast: "（先月と同じ）",
  vsLast: (sign, amount) => `（先月より${sign}${amount}）`,
  wastedItems: (names, more) => `捨てちゃった物：${names}${more ? " ほか" : ""}`,
  zeroWaste: "捨てた物ゼロ！すごい🎉",
  unpriced: (n) => `※金額が入っていない食材が${n}件あるよ`,
  details: (url) => `くわしくはこちら👇\n${url}`,
  languageText: "🌐 話す言葉を選んでね",
  languageChanged: (name) => `🌐 これからは${name}で話すね！`,
};

const en: Messages = {
  greeting: (personal) => `Hi there! I'm Fridgy, your fridge keeper 🧊✨

I'll remember what's in ${personal ? "your" : "this group's"} fridge
and help you stop asking "do we still have that?" or finding things past their date.

Nice to meet you 😊`,
  help: (link) => `📖 How to use me

[Teach me what you have]
📸 Send a photo of a receipt
 → I'll send you a page to check what I read
🧊 A photo of the inside of your fridge works too
 → Tick what's really there (and add anything I missed)
✏️ To type it in: "add milk 198"
 For several items, one per line 👇
 add
 cabbage half 3d
 pork 400 freezer
 eggs
 (price, amount left (full/half/little), fridge/freezer/pantry and "3d" = bought 3 days ago are all optional)
 You can also add on this page: ${link("/inventory")}

[Check & record]
🥬 "fridge" shows what's in your fridge
 ${link("/inventory")}
⏰ I'll message you at 5pm on the day something expires
 → Tap "Used some", "Used up" or "Threw away"

[Meals & shopping]
🍳 "recipe" gives you 3 ideas from what you have
 e.g. recipe italian / recipe 15 min
🛒 "shopping" shows your shopping list
 ${link("/shopping")}
➕ "buy milk eggs" adds to the list

[Money]
💰 "spending" shows this month's food spending and how much was thrown away (last month's arrives on the 1st)
 ${link("/report")}

🌐 "language" changes the language I speak

Need me? Just send "help" 😊`,
  setupAlt: "Use me alone, or share with someone?",
  setupText: "How will you use me? 👇",
  setupSolo: "Just me",
  setupShare: "Share",
  shareGuide: `👫 To use me with family or a partner, invite me to a LINE group!

1️⃣ On the LINE home screen, tap "Create a group"
2️⃣ Choose the people you share with, plus me (Fridgy)
3️⃣ Once I'm in the group, I'll say hi and explain how I work there

Already have a group? Just add me from that group's "Invite" 🙆

* The group's fridge is kept separate from this chat. When sharing, send photos and messages in the group 📸`,
  storage: { fridge: "Fridge", freezer: "Freezer", pantry: "Pantry" },
  list: (names) => names.map((n) => `• ${n}`).join("\n"),
  join: (names) => names.join(", "),
  addedToShopping: (names) => `🛒 Added to your shopping list!\n${en.list(names)}`,
  alreadyInShopping: "That's already on the list 👌",
  notFoodPhoto: "This doesn't look like a receipt or the inside of a fridge 🤔\nTry a photo of a receipt or your fridge 📸",
  lowConfidence: (n) => `\n(I'm not sure about ${n}, please check 🙏)`,
  fridgeRead: (n, note, url) => `🧊 I found ${n} items in your fridge!${note}\nTick what's there and save 👇\n${url}`,
  receiptRead: (n, note, url) => `📸 I read your receipt: ${n} lines${note}\nCheck it and save 👇\n${url}`,
  emptyFridge: "Your fridge is empty for now 🫙\nSend a receipt or a fridge photo and I'll remember it 📸",
  inventoryLine: (name, pct, storage, expires) => `• ${name}${pct < 100 ? ` (${pct}% left)` : ""} ${storage} ${expires ? `until ${expires}` : ""}`,
  inventory: (count, lines, url) => `🥬 Here's what's in your fridge (${count})\n${lines}\n\nTo change amounts or dates 👇\n${url}`,
  recipeEmpty: "Your fridge is empty, so I can't think of a meal 😢\nSend a receipt or fridge photo, or tell me with \"add item\"!",
  shopping: (count, list, url) => `🛒 Shopping list (${count})\n${list}\n\nTick off or add items here 👇\n${url}`,
  shoppingEmpty: "Nothing to buy right now ✨",
  addUsage: (url) => `Write the items after "add" ✏️\ne.g. add milk 198\n\nFor several, one per line 👇\nadd\ncabbage half 3d\npork 400 freezer\n\nYou can also add on this page: ${url}`,
  added: (count, names, note) => `✅ Got it, ${count} item${count === 1 ? "" : "s"}!\n${names}${note}`,
  unknownExpiry: (names, url) => `\n\nI couldn't estimate a date for ${names} 🤔 You can set one here 👇\n${url}`,
  unknownCommand: "Sorry, I don't understand that yet 🙏\nSend \"help\" and I'll show you what I can do 😊",
  error: "Sorry, something went wrong 💦\nPlease try again in a little while 🙏",
  noticeTitle: "🌙 Some food expires today! Use it tonight",
  noticeDue: "Today",
  noticeLess: "Used some",
  noticeUsedUp: "Used up",
  noticeDiscard: "Threw away",
  noticeMore: (n) => `${n} more. See the full list 👀`,
  noticeOpen: "See what's in the fridge",
  left: (pct) => ` (${pct}% left)`,
  actionNotFound: "Hmm, I couldn't find that item 🤔",
  actionAlready: (name) => `${name} is already recorded 👌`,
  actionDiscarded: (name, loss) => `Recorded ${name} as thrown away${loss ? ` (${loss} lost)` : ""}. Let's finish it next time 🍀`,
  actionUsedUp: (name) => `You used up the ${name}! Nice 👏`,
  actionRemaining: (name, pct) => `${name} is now at ${pct}% 📝`,
  minutes: (n) => `About ${n} min`,
  uses: (names) => `Uses: ${names}`,
  none: "none",
  missing: (names) => `To buy: ${names}`,
  addMissing: "Add to shopping list",
  addMissingDisplay: (title) => `Add ingredients for ${title} to the shopping list`,
  allInStock: "You have everything ✨",
  shoppingHint: "I'll put anything missing on your shopping list 🛒 Send \"shopping\" to see it anytime.",
  openShopping: "Open shopping list",
  recipeAlt: (titles) => `🍳 How about these today? ${titles}`,
  thisMonth: "This month's food spending",
  lastMonth: "Last month's food spending",
  reportHeader: (title, month) => `📊 ${title} (${new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })})`,
  spend: "💰 Spent: ",
  waste: "🗑️ Thrown away: ",
  ofSpend: (pct) => ` (${pct}% of spending)`,
  sameAsLast: " (same as last month)",
  vsLast: (sign, amount) => ` (${sign}${amount} vs last month)`,
  wastedItems: (names, more) => `Thrown away: ${names}${more ? " and more" : ""}`,
  zeroWaste: "Nothing thrown away! Amazing 🎉",
  unpriced: (n) => `* ${n} item${n === 1 ? " has" : "s have"} no price`,
  details: (url) => `More details 👇\n${url}`,
  languageText: "🌐 Choose my language",
  languageChanged: (name) => `🌐 I'll speak ${name} from now on!`,
};

const fr: Messages = {
  greeting: (personal) => `Salut ! Je suis Fridgy, le gardien de ton frigo 🧊✨

Je retiens ce qu'il y a dans ${personal ? "ton frigo" : "le frigo de ce groupe"}
pour t'éviter les « il en reste encore ? » et les produits périmés oubliés.

Ravi de te rencontrer 😊`,
  help: (link) => `📖 Comment m'utiliser

[Ce que tu as acheté]
📸 Envoie la photo d'un ticket de caisse
 → je t'envoie une page pour vérifier ce que j'ai lu
🧊 Une photo de l'intérieur du frigo marche aussi
 → coche ce qui y est vraiment (et ajoute ce que j'ai raté)
✏️ Pour l'écrire : « ajouter lait 198 »
 Plusieurs articles ? Un par ligne 👇
 ajouter
 chou moitié 3j
 porc 400 congélateur
 œufs
 (prix, quantité restante (plein/moitié/peu), frigo/congélateur/placard et « 3j » = acheté il y a 3 jours sont facultatifs)
 Tu peux aussi ajouter sur cette page : ${link("/inventory")}

[Voir et noter]
🥬 « frigo » montre ce qu'il y a dans ton frigo
 ${link("/inventory")}
⏰ Je te préviens à 17 h le jour où un produit expire
 → touche « Entamé », « Terminé » ou « Jeté »

[Repas et courses]
🍳 « recette » te propose 3 idées avec ce que tu as
 ex. : recette italienne / recette 15 min
🛒 « courses » affiche ta liste de courses
 ${link("/shopping")}
➕ « acheter lait œufs » l'ajoute à la liste

[Budget]
💰 « dépenses » affiche les dépenses alimentaires du mois et ce qui a été jeté (le bilan du mois précédent arrive le 1er)
 ${link("/report")}

🌐 « langue » pour changer ma langue

Besoin d'aide ? Envoie « aide » 😊`,
  setupAlt: "Tu m'utilises seul ou à plusieurs ?",
  setupText: "Comment vas-tu m'utiliser ? 👇",
  setupSolo: "Seul",
  setupShare: "À plusieurs",
  shareGuide: `👫 Pour m'utiliser en famille ou à deux, invite-moi dans un groupe LINE !

1️⃣ Sur l'écran d'accueil de LINE, touche « Créer un groupe »
2️⃣ Choisis les personnes avec qui partager, et moi (Fridgy)
3️⃣ Une fois dans le groupe, je dirai bonjour et j'expliquerai comment je marche

Tu as déjà un groupe ? Ajoute-moi simplement avec « Inviter » 🙆

* Le frigo du groupe est séparé de cette conversation. À plusieurs, envoie les photos et messages dans le groupe 📸`,
  storage: { fridge: "Frigo", freezer: "Congélateur", pantry: "Placard" },
  list: (names) => names.map((n) => `• ${n}`).join("\n"),
  join: (names) => names.join(", "),
  addedToShopping: (names) => `🛒 Ajouté à ta liste de courses !\n${fr.list(names)}`,
  alreadyInShopping: "C'est déjà sur la liste 👌",
  notFoodPhoto: "Ça ne ressemble ni à un ticket ni à l'intérieur d'un frigo 🤔\nEnvoie la photo d'un ticket ou de ton frigo 📸",
  lowConfidence: (n) => `\n(Je ne suis pas sûr pour ${n}, vérifie s'il te plaît 🙏)`,
  fridgeRead: (n, note, url) => `🧊 J'ai trouvé ${n} produits dans ton frigo !${note}\nCoche ce qui y est et enregistre 👇\n${url}`,
  receiptRead: (n, note, url) => `📸 J'ai lu ton ticket : ${n} lignes${note}\nVérifie et enregistre 👇\n${url}`,
  emptyFridge: "Ton frigo est vide pour l'instant 🫙\nEnvoie un ticket ou une photo du frigo et je m'en souviendrai 📸",
  inventoryLine: (name, pct, storage, expires) => `• ${name}${pct < 100 ? ` (reste ${pct} %)` : ""} ${storage} ${expires ? `jusqu'au ${expires}` : ""}`,
  inventory: (count, lines, url) => `🥬 Voici ce qu'il y a dans ton frigo (${count})\n${lines}\n\nPour modifier quantités ou dates 👇\n${url}`,
  recipeEmpty: "Ton frigo est vide, je ne peux pas proposer de repas 😢\nEnvoie un ticket ou une photo du frigo, ou dis-le-moi avec « ajouter produit » !",
  shopping: (count, list, url) => `🛒 Liste de courses (${count})\n${list}\n\nCocher ou ajouter ici 👇\n${url}`,
  shoppingEmpty: "Rien à acheter pour l'instant ✨",
  addUsage: (url) => `Écris les produits après « ajouter » ✏️\nex. : ajouter lait 198\n\nPlusieurs ? Un par ligne 👇\najouter\nchou moitié 3j\nporc 400 congélateur\n\nTu peux aussi ajouter sur cette page : ${url}`,
  added: (count, names, note) => `✅ C'est noté, ${count} produit${count === 1 ? "" : "s"} !\n${names}${note}`,
  unknownExpiry: (names, url) => `\n\nJe n'ai pas pu estimer la date pour ${names} 🤔 Tu peux l'indiquer ici 👇\n${url}`,
  unknownCommand: "Désolé, je ne comprends pas encore 🙏\nEnvoie « aide » et je te montre ce que je sais faire 😊",
  error: "Désolé, quelque chose s'est mal passé 💦\nRéessaie dans un petit moment 🙏",
  noticeTitle: "🌙 Des produits expirent aujourd'hui ! Utilise-les ce soir",
  noticeDue: "Aujourd'hui",
  noticeLess: "Entamé",
  noticeUsedUp: "Terminé",
  noticeDiscard: "Jeté",
  noticeMore: (n) => `Encore ${n}. Vois la liste complète 👀`,
  noticeOpen: "Voir le contenu du frigo",
  left: (pct) => ` (reste ${pct} %)`,
  actionNotFound: "Hmm, je n'ai pas trouvé ce produit 🤔",
  actionAlready: (name) => `${name} est déjà noté 👌`,
  actionDiscarded: (name, loss) => `${name} noté comme jeté${loss ? ` (perte : ${loss})` : ""}. La prochaine fois, on le finit 🍀`,
  actionUsedUp: (name) => `${name} terminé ! Bravo 👏`,
  actionRemaining: (name, pct) => `Il reste ${pct} % de ${name} 📝`,
  minutes: (n) => `Environ ${n} min`,
  uses: (names) => `Utilise : ${names}`,
  none: "rien",
  missing: (names) => `À acheter : ${names}`,
  addMissing: "Ajouter aux courses",
  addMissingDisplay: (title) => `Ajouter les ingrédients de ${title} aux courses`,
  allInStock: "Tu as tout ce qu'il faut ✨",
  shoppingHint: "Je mets ce qui manque sur ta liste de courses 🛒 Envoie « courses » pour la voir.",
  openShopping: "Ouvrir la liste de courses",
  recipeAlt: (titles) => `🍳 Que dirais-tu de ça aujourd'hui ? ${titles}`,
  thisMonth: "Dépenses alimentaires du mois",
  lastMonth: "Dépenses alimentaires du mois dernier",
  reportHeader: (title, month) => `📊 ${title} (${new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("fr-FR", { month: "long", timeZone: "UTC" })})`,
  spend: "💰 Dépensé : ",
  waste: "🗑️ Jeté : ",
  ofSpend: (pct) => ` (${pct} % des dépenses)`,
  sameAsLast: " (comme le mois dernier)",
  vsLast: (sign, amount) => ` (${sign}${amount} par rapport au mois dernier)`,
  wastedItems: (names, more) => `Jeté : ${names}${more ? " et plus" : ""}`,
  zeroWaste: "Rien de jeté ! Bravo 🎉",
  unpriced: (n) => `* ${n} produit${n === 1 ? "" : "s"} sans prix`,
  details: (url) => `Plus de détails 👇\n${url}`,
  languageText: "🌐 Choisis ma langue",
  languageChanged: (name) => `🌐 Je parlerai ${name} à partir de maintenant !`,
};

const ko: Messages = {
  greeting: (personal) => `안녕! 냉장고 지킴이 Fridgy(프리지)야 🧊✨

${personal ? "너와 가족의" : "이 그룹의"} 냉장고에 뭐가 있는지 기억해 두고,
"그거 아직 있었나?"나 "어느새 유통기한이 지났네…"를 줄이도록 도와줄게.

앞으로 잘 부탁해 😊`,
  help: (link) => `📖 내 사용법이야

[기억시키기]
📸 영수증 사진을 보내 줘
 → 읽은 내용을 확인하는 화면을 보내 줄게
🧊 냉장고 안 사진도 OK
 → 찾은 식재료 중에서 지금 있는 걸 골라 줘 (안 찍힌 것도 추가할 수 있어)
✏️ 직접 입력할 땐 "추가 우유 198"
 여러 개면 한 줄에 하나씩 👇
 추가
 양배추 반 3일전
 돼지고기 400 냉동
 달걀
 (금액, 남은 양(가득/반/조금), 냉장/냉동/실온, ○일전은 생략해도 돼)
 화면에서도 넣을 수 있어: ${link("/inventory")}

[보기·기록하기]
🥬 "재고"로 냉장고 안을 보여 줄게
 ${link("/inventory")}
⏰ 유통기한 당일 오후 5시에 알려 줄게
 → "줄었어", "다 썼어", "버렸어" 버튼으로 알려 줘

[식사와 장보기]
🍳 "레시피"로 지금 있는 재료로 3가지 요리를 생각해 줄게
 예: 레시피 한식 / 레시피 15분
🛒 "장보기"로 장보기 목록
 ${link("/shopping")}
➕ "사기 우유 달걀"로 목록에 추가

[돈]
💰 "식비"로 이번 달 식비와 버린 금액을 알려 줄게 (매달 1일에는 지난달 것도 보내 줄게)
 ${link("/report")}

🌐 "언어"로 내가 쓰는 말을 바꿀 수 있어

궁금하면 언제든 "사용법"이라고 보내 줘 😊`,
  setupAlt: "혼자 쓸래? 아니면 누군가와 같이 쓸래?",
  setupText: "나를 어떻게 쓸래? 👇",
  setupSolo: "혼자 쓰기",
  setupShare: "같이 쓰기",
  shareGuide: `👫 가족이나 파트너와 같이 쓰려면 LINE 그룹에 나를 초대해 줘!

1️⃣ LINE 홈 화면에서 "그룹 만들기"를 탭
2️⃣ 같이 쓸 사람과 나(Fridgy)를 골라 그룹을 만들기
3️⃣ 내가 그룹에 들어가면 거기서 인사하고 사용법을 보낼게

이미 그룹이 있으면 그 그룹의 "초대"에서 나를 추가하기만 하면 돼 🙆

※ 그룹의 냉장고는 이 대화와 따로 관리해. 같이 쓸 때는 그룹에 사진과 메시지를 보내 줘 📸`,
  storage: { fridge: "냉장", freezer: "냉동", pantry: "실온" },
  list: (names) => names.map((n) => `• ${n}`).join("\n"),
  join: (names) => names.join(", "),
  addedToShopping: (names) => `🛒 장보기 목록에 넣었어!\n${ko.list(names)}`,
  alreadyInShopping: "그건 이미 목록에 있어 👌",
  notFoodPhoto: "이 사진은 영수증도 냉장고 안도 아닌 것 같아 🤔\n영수증이나 냉장고 안을 찍어서 보내 줘 📸",
  lowConfidence: (n) => `\n(${n}개는 좀 자신이 없으니까 확인해 줘 🙏)`,
  fridgeRead: (n, note, url) => `🧊 냉장고에서 ${n}가지를 찾았어!${note}\n지금 있는 걸 체크해서 등록해 줘 👇\n${url}`,
  receiptRead: (n, note, url) => `📸 영수증을 읽었어! ${n}줄 있었어${note}\n맞는지 보고 등록해 줘 👇\n${url}`,
  emptyFridge: "냉장고가 아직 텅 비었어 🫙\n영수증이나 냉장고 사진을 보내 주면 기억할게 📸",
  inventoryLine: (name, pct, storage, expires) => `• ${name}${pct < 100 ? ` (${pct}% 남음)` : ""} ${storage} ${expires ? `~${expires}` : ""}`,
  inventory: (count, lines, url) => `🥬 지금 냉장고 안이야 (${count}개)\n${lines}\n\n남은 양이나 기한을 고칠 땐 여기 👇\n${url}`,
  recipeEmpty: "냉장고가 비어서 메뉴를 생각할 수 없어 😢\n영수증이나 냉장고 사진을 보내거나 \"추가 품명\"으로 알려 줘!",
  shopping: (count, list, url) => `🛒 장보기 목록 (${count}개)\n${list}\n\n체크나 추가는 여기서 👇\n${url}`,
  shoppingEmpty: "지금은 살 게 없어 ✨",
  addUsage: (url) => `"추가" 뒤에 품명을 써 줘 ✏️\n예: 추가 우유 198\n\n여러 개면 한 줄에 하나씩 👇\n추가\n양배추 반 3일전\n돼지고기 400 냉동\n\n화면에서도 넣을 수 있어: ${url}`,
  added: (count, names, note) => `✅ ${count}개 기억했어!\n${names}${note}`,
  unknownExpiry: (names, url) => `\n\n${names}은(는) 기한을 짐작하지 못했어 🤔 괜찮으면 기한을 넣어 줘 👇\n${url}`,
  unknownCommand: "미안, 그 말은 아직 몰라 🙏\n\"사용법\"이라고 보내 주면 할 수 있는 걸 알려 줄게 😊",
  error: "미안, 잘 안 됐어 💦\n잠시 후에 다시 보내 줘 🙏",
  noticeTitle: "🌙 오늘이 기한인 식재료가 있어! 오늘 밤에 써 줘",
  noticeDue: "오늘까지",
  noticeLess: "줄었어",
  noticeUsedUp: "다 썼어",
  noticeDiscard: "버렸어",
  noticeMore: (n) => `${n}개 더 있어. 목록에서 봐 줘 👀`,
  noticeOpen: "냉장고 안 보기",
  left: (pct) => ` (${pct}% 남음)`,
  actionNotFound: "어라, 그 식재료를 못 찾았어 🤔",
  actionAlready: (name) => `${name}은(는) 이미 기록했어 👌`,
  actionDiscarded: (name, loss) => `${name}을(를) "버렸어"로 기록했어${loss ? ` (손실 ${loss})` : ""}. 다음엔 맛있게 다 먹자 🍀`,
  actionUsedUp: (name) => `${name} 다 썼구나! 잘했어 👏`,
  actionRemaining: (name, pct) => `${name}의 남은 양을 ${pct}%로 했어 📝`,
  minutes: (n) => `약 ${n}분`,
  uses: (names) => `사용: ${names}`,
  none: "없음",
  missing: (names) => `살 것: ${names}`,
  addMissing: "부족한 걸 목록에",
  addMissingDisplay: (title) => `${title} 재료를 장보기 목록에`,
  allInStock: "지금 있는 재료만으로 만들 수 있어 ✨",
  shoppingHint: "부족한 건 장보기 목록에 넣어 둘게 🛒 \"장보기\"로 언제든 볼 수 있어.",
  openShopping: "장보기 목록 열기",
  recipeAlt: (titles) => `🍳 오늘은 이거 어때? ${titles}`,
  thisMonth: "이번 달 식비",
  lastMonth: "지난달 식비",
  reportHeader: (title, month) => `📊 ${title} (${month}월)`,
  spend: "💰 식비: ",
  waste: "🗑️ 버린 금액: ",
  ofSpend: (pct) => ` (식비의 ${pct}%)`,
  sameAsLast: " (지난달과 같음)",
  vsLast: (sign, amount) => ` (지난달보다 ${sign}${amount})`,
  wastedItems: (names, more) => `버린 것: ${names}${more ? " 외" : ""}`,
  zeroWaste: "버린 게 하나도 없어! 대단해 🎉",
  unpriced: (n) => `※ 금액이 없는 식재료가 ${n}개 있어`,
  details: (url) => `자세한 건 여기 👇\n${url}`,
  languageText: "🌐 내가 쓸 말을 골라 줘",
  languageChanged: (name) => `🌐 이제부터 ${name}로 말할게!`,
};

const zh: Messages = {
  greeting: (personal) => `你好！我是冰箱小管家 Fridgy 🧊✨

我会记住${personal ? "你和家人" : "这个群组"}的冰箱里有什么，
帮你减少"那个还有吗？"和"不知不觉就过期了…"的情况。

今后请多关照 😊`,
  help: (link) => `📖 我的使用方法

【让我记住】
📸 发送购物小票的照片
 → 我会发给你一个确认识别结果的页面
🧊 冰箱里面的照片也可以
 → 从找到的食材里选出现在有的（没拍到的也能添加）
✏️ 手动输入请发"添加 牛奶 198"
 多个食材请每行一个 👇
 添加
 卷心菜 一半 3天前
 猪肉 400 冷冻
 鸡蛋
 （价格、剩余量（满/一半/少许）、冷藏/冷冻/常温、○天前都可以省略）
 也可以在页面上添加：${link("/inventory")}

【查看・记录】
🥬 发"库存"查看冰箱里的东西
 ${link("/inventory")}
⏰ 保质期当天下午5点提醒你
 → 用"用了一些""用完了""扔掉了"按钮告诉我

【做饭和购物】
🍳 发"食谱"，我会用现有食材想3道菜
 例：食谱 中餐 / 食谱 15分钟
🛒 发"购物"查看购物清单
 ${link("/shopping")}
➕ 发"买 牛奶 鸡蛋"添加到清单

【花费】
💰 发"伙食费"查看本月伙食费和扔掉的金额（每月1日也会发上个月的）
 ${link("/report")}

🌐 发"语言"可以切换我说的语言

有问题随时发"帮助"给我 😊`,
  setupAlt: "一个人用？还是和别人一起用？",
  setupText: "你打算怎么用我？👇",
  setupSolo: "一个人用",
  setupShare: "一起用",
  shareGuide: `👫 想和家人或伴侣一起用的话，请把我邀请到 LINE 群组！

1️⃣ 在 LINE 主页点击"建立群组"
2️⃣ 选择要一起用的人和我（Fridgy）建立群组
3️⃣ 我进群后，会在群里打招呼并介绍用法

已经有群组的话，在那个群组的"邀请"里加我就可以了 🙆

※ 群组的冰箱和这个聊天分开管理。一起用的时候请在群组里发照片和消息 📸`,
  storage: { fridge: "冷藏", freezer: "冷冻", pantry: "常温" },
  list: (names) => names.map((n) => `・${n}`).join("\n"),
  join: (names) => names.join("、"),
  addedToShopping: (names) => `🛒 已加入购物清单！\n${zh.list(names)}`,
  alreadyInShopping: "已经在清单里了 👌",
  notFoodPhoto: "这张照片好像不是小票，也不是冰箱里面 🤔\n请拍小票或冰箱里面发给我 📸",
  lowConfidence: (n) => `\n（有${n}项不太确定，请确认一下 🙏）`,
  fridgeRead: (n, note, url) => `🧊 在冰箱里找到了${n}样东西！${note}\n勾选现在有的并保存 👇\n${url}`,
  receiptRead: (n, note, url) => `📸 小票读好了！共${n}行${note}\n确认无误后保存 👇\n${url}`,
  emptyFridge: "冰箱现在还是空的 🫙\n发小票或冰箱照片给我，我就会记住 📸",
  inventoryLine: (name, pct, storage, expires) => `・${name}${pct < 100 ? `（剩${pct}%）` : ""} ${storage} ${expires ? `至${expires}` : ""}`,
  inventory: (count, lines, url) => `🥬 现在冰箱里有这些（${count}样）\n${lines}\n\n修改剩余量或保质期请点这里 👇\n${url}`,
  recipeEmpty: "冰箱是空的，想不出菜单 😢\n请发小票或冰箱照片，或者用\"添加 品名\"告诉我！",
  shopping: (count, list, url) => `🛒 购物清单（${count}项）\n${list}\n\n勾选或添加请点这里 👇\n${url}`,
  shoppingEmpty: "现在没有要买的 ✨",
  addUsage: (url) => `请在"添加"后面写品名 ✏️\n例：添加 牛奶 198\n\n多个请每行一个 👇\n添加\n卷心菜 一半 3天前\n猪肉 400 冷冻\n\n也可以在页面上添加：${url}`,
  added: (count, names, note) => `✅ 记住了${count}样！\n${names}${note}`,
  unknownExpiry: (names, url) => `\n\n${names}估计不出保质期 🤔 可以的话请填一下 👇\n${url}`,
  unknownCommand: "抱歉，我还听不懂这句话 🙏\n发\"帮助\"给我，我来告诉你我能做什么 😊",
  error: "抱歉，没能成功 💦\n请稍后再发一次 🙏",
  noticeTitle: "🌙 有今天到期的食材！今晚用掉吧",
  noticeDue: "今天到期",
  noticeLess: "用了一些",
  noticeUsedUp: "用完了",
  noticeDiscard: "扔掉了",
  noticeMore: (n) => `还有${n}项，请在清单里查看 👀`,
  noticeOpen: "查看冰箱里的东西",
  left: (pct) => `（剩${pct}%）`,
  actionNotFound: "咦，没找到这个食材 🤔",
  actionAlready: (name) => `${name}已经记录过了 👌`,
  actionDiscarded: (name, loss) => `已把${name}记为"扔掉了"${loss ? `（损失${loss}）` : ""}。下次好好吃完吧 🍀`,
  actionUsedUp: (name) => `${name}用完了！真棒 👏`,
  actionRemaining: (name, pct) => `${name}的剩余量改为${pct}% 📝`,
  minutes: (n) => `约${n}分钟`,
  uses: (names) => `用到：${names}`,
  none: "无",
  missing: (names) => `需要买：${names}`,
  addMissing: "缺的加入清单",
  addMissingDisplay: (title) => `把${title}的材料加入购物清单`,
  allInStock: "现有食材就能做 ✨",
  shoppingHint: "缺的东西我会加到购物清单 🛒 随时发\"购物\"就能看。",
  openShopping: "打开购物清单",
  recipeAlt: (titles) => `🍳 今天做这些怎么样？${titles}`,
  thisMonth: "本月伙食费",
  lastMonth: "上个月伙食费",
  reportHeader: (title, month) => `📊 ${title}（${month}月）`,
  spend: "💰 伙食费：",
  waste: "🗑️ 浪费：",
  ofSpend: (pct) => `（占伙食费${pct}%）`,
  sameAsLast: "（和上个月一样）",
  vsLast: (sign, amount) => `（比上个月${sign}${amount}）`,
  wastedItems: (names, more) => `扔掉的：${names}${more ? " 等" : ""}`,
  zeroWaste: "一样都没扔！太棒了 🎉",
  unpriced: (n) => `※ 有${n}样食材没有价格`,
  details: (url) => `详情请看 👇\n${url}`,
  languageText: "🌐 选择我说的语言",
  languageChanged: (name) => `🌐 以后我就说${name}啦！`,
};

const ALL: Record<Lang, Messages> = { ja, en, fr, ko, zh };

export const t = (lang: Lang): Messages => ALL[lang];

export { formatYen, LANG_NAMES };
