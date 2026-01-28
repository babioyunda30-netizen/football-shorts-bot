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
  }
});

client.login(TOKEN);
