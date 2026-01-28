import { Client, GatewayIntentBits } from "discord.js";
import http from "node:http";
import { getDailyNews } from "./news.js";

const TOKEN = process.env.DISCORD_TOKEN;
const TARGET_USER_ID = process.env.TARGET_USER_ID;
const PORT = process.env.PORT || 3000;

// Render port ister: küçük HTTP server
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot is alive");
  })
  .listen(PORT, () => {
    console.log("HTTP server running on port " + PORT);
  });

if (!TOKEN) {
  console.error("DISCORD_TOKEN yok (Render env variables kontrol et).");
  process.exit(1);
}
if (!TARGET_USER_ID) {
  console.error("TARGET_USER_ID yok (Render env variables kontrol et).");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", async () => {
  console.log(`Bot hazır: ${client.user.tag}`);
  const user = await client.users.fetch(TARGET_USER_ID);
  await user.send("🤖 Bot çalışıyor. DM testi başarılı!");
});

client.on("messageCreate", async (msg) => {
  // sadece senin DM'lerin
  if (msg.author.id !== TARGET_USER_ID) return;

  const t = msg.content.toLowerCase().trim();

  if (t === "test") {
    await msg.reply("✅ Test aldım.");
    return;
  }

  if (t === "haber") {
    try {
      const n = await getDailyNews();
      await msg.reply(
        `📰 **Günün Futbol Haberi**\n\n**${n.title}**\n${n.summary}\n\nKaynak: ${n.link}`
      );
    } catch (e) {
      console.error(e);
      await msg.reply("❌ Haber çekemedim. Biraz sonra tekrar dene.");
    }
  }
});

client.login(TOKEN);
