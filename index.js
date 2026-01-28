import { Client, GatewayIntentBits } from "discord.js";
import http from "node:http";
import cron from "node-cron";
import { getDailyNews, getTwoDailyNews } from "./news.js";

const TOKEN = process.env.DISCORD_TOKEN;
const TARGET_USER_ID = process.env.TARGET_USER_ID;
const PORT = process.env.PORT || 3000;

// Render port ister: mini HTTP server
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot is alive");
  })
  .listen(PORT, () => console.log("HTTP server running on port " + PORT));

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

async function dm(text) {
  const user = await client.users.fetch(TARGET_USER_ID);
  return user.send(text);
}

function packMessage(d) {
  return (
    `📅 **Günlük 2 içerik önerisi**\n\n` +
    `🕛 **Öğlen (12:30)**\n**${d.noon.title}**\n${d.noon.summary}\nKaynak: ${d.noon.link}\n\n` +
    `🌙 **Akşam (20:30)**\n**${d.evening.title}**\n${d.evening.summary}\nKaynak: ${d.evening.link}\n\n` +
    `Komutlar:\n- "oglen kalsin" / "oglen sil"\n- "aksam kalsin" / "aksam sil"`
  );
}

client.once("ready", async () => {
  console.log(`Bot hazır: ${client.user.tag}`);
  await dm("🤖 Bot çalışıyor. DM testi başarılı!");

  // Her gün 12:30 ve 20:30 (Azerbaycan saati +04:00)
  // Render genelde UTC'dir; en garanti yöntem: timezone ile cron
  cron.schedule(
    "30 8 * * *",
    async () => {
      // 08:30 UTC = 12:30 AZT (+04)
      try {
        const d = await getTwoDailyNews();
        await dm("⏰ **Otomatik günlük paket (Öğlen)**\n\n" + packMessage(d));
      } catch (e) {
        console.error(e);
        await dm("❌ Otomatik paket (öğlen) hazırlanamadı.");
      }
    },
    { timezone: "UTC" }
  );

  cron.schedule(
    "30 16 * * *",
    async () => {
      // 16:30 UTC = 20:30 AZT (+04)
      try {
        const d = await getTwoDailyNews();
        await dm("⏰ **Otomatik günlük paket (Akşam)**\n\n" + packMessage(d));
      } catch (e) {
        console.error(e);
        await dm("❌ Otomatik paket (akşam) hazırlanamadı.");
      }
    },
    { timezone: "UTC" }
  );
});

client.on("messageCreate", async (msg) => {
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
    return;
  }

  if (t === "gunluk") {
    try {
      const d = await getTwoDailyNews();
      await msg.reply(packMessage(d));
    } catch (e) {
      console.error(e);
      await msg.reply("❌ Günlük paket hazırlayamadım. Biraz sonra dene.");
    }
    return;
  }

  // Şimdilik bu komutlar sadece "not" gibi. (YouTube silme/yükleme FAZ 2)
  if (t === "oglen sil") {
    await msg.reply("🗑️ Öğlen içeriği: SİLİNSİN olarak işaretlendi (şimdilik not).");
    return;
  }
  if (t === "oglen kalsin") {
    await msg.reply("✅ Öğlen içeriği: KALSIN olarak işaretlendi (şimdilik not).");
    return;
  }
  if (t === "aksam sil") {
    await msg.reply("🗑️ Akşam içeriği: SİLİNSİN olarak işaretlendi (şimdilik not).");
    return;
  }
  if (t === "aksam kalsin") {
    await msg.reply("✅ Akşam içeriği: KALSIN olarak işaretlendi (şimdilik not).");
    return;
  }
});

client.login(TOKEN);
