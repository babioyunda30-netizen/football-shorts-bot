import { Client, GatewayIntentBits } from "discord.js";
import { getDailyNews } from "./news.js";

const TOKEN = process.env.DISCORD_TOKEN;
const TARGET_USER_ID = process.env.TARGET_USER_ID;

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
  user.send("🤖 Bot çalışıyor. DM testi başarılı!");
});

client.on("messageCreate", (msg) => {
  if (msg.author.id !== TARGET_USER_ID) return;

  if (msg.content.toLowerCase() === "test") {
    msg.reply("✅ Test aldım.");

      if (msg.content.toLowerCase() === "haber") {
    try {
      const n = await getDailyNews();
      await msg.reply(
        `📰 **Günün Futbol Haberi**\n\n**${n.title}**\n${n.summary}\n\nKaynak: ${n.link}`
      );
    } catch (e) {
      await msg.reply("❌ Haber çekemedim. Biraz sonra tekrar dene.");
      console.error(e);
    }
  }

  }
});

client.login(TOKEN);
import http from "http";

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is alive");
}).listen(PORT, () => {
  console.log("HTTP server running on port " + PORT);
});
