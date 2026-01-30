import { Client, GatewayIntentBits, Events } from "discord.js";
import http from "node:http";
import cron from "node-cron";
import fs from "fs";

import { getTwoDailyNews, getDailyNews } from "./news.js";
import { fetchImagesFromArticle } from "./images.js";
import { createSlideshowVideo } from "./slideshow.js";

const TOKEN = process.env.DISCORD_TOKEN;
const TARGET_USER_ID = process.env.TARGET_USER_ID;
const PORT = process.env.PORT || 3000;

/* ------------------ HTTP keep-alive ------------------ */
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("alive");
}).listen(PORT);

/* ------------------ Güvenlik kontrolleri ------------------ */
if (!TOKEN) {
  console.error("DISCORD_TOKEN yok");
  process.exit(1);
}
if (!TARGET_USER_ID) {
  console.error("TARGET_USER_ID yok");
  process.exit(1);
}

/* ------------------ Client ------------------ */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* ------------------ Crash KORUMASI ------------------ */
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

/* Discord client error yakala */
client.on("error", (err) => {
  console.error("DISCORD CLIENT ERROR:", err);
});

/* ------------------ DM helper (ASLA crash atmaz) ------------------ */
async function safeDM(text) {
  try {
    const user = await client.users.fetch(TARGET_USER_ID);
    await user.send(text);
  } catch (e) {
    console.error("DM FAILED:", e?.message || e);
  }
}

/* ------------------ READY ------------------ */
client.once(Events.ClientReady, async () => {
  console.log(`Bot hazır: ${client.user.tag}`);
  await safeDM("🤖 Bot ayakta. Sistem stabil.");
});

/* ------------------ KOMUTLAR ------------------ */
client.on("messageCreate", async (msg) => {
  if (msg.author.id !== TARGET_USER_ID) return;

  const t = msg.content.toLowerCase().trim();

  /* ---- Basit test ---- */
  if (t === "test") {
    await msg.reply("✅ Bot çalışıyor.");
    return;
  }

  /* ---- Haber ---- */
  if (t === "haber") {
    try {
      const n = await getDailyNews();
      await msg.reply(
        `📰 **${n.title}**\n\n${n.summary}\n\n🔗 ${n.link}`
      );
    } catch (e) {
      console.error(e);
      await msg.reply("❌ Haber alınamadı.");
    }
    return;
  }

  /* ---- VIDEO DEMO (STABİL) ---- */
  if (t === "videodemo") {
    try {
      await msg.reply("🎬 Demo hazırlanıyor (çökmez sürüm)…");

      const n = await getDailyNews();
      const images = await fetchImagesFromArticle(n.link);

      if (!images.length) {
        await msg.reply("⚠️ Görsel bulunamadı, başka haber dene.");
        return;
      }

      const videoPath = await createSlideshowVideo({
        imageUrls: images,
        title: n.title,
        summary: n.summary,
        secondsPerSlide: 2, // hafif
        outPath: "/tmp/demo.mp4"
      });

      await msg.reply({
        content: `✅ **Video hazır**\n${n.title}\n\n🔗 ${n.link}`,
        files: [videoPath]
      });

    } catch (e) {
      console.error("VIDEODEMO ERROR:", e);
      await msg.reply("❌ Video üretirken hata oldu (loglara bak).");
    }
    return;
  }
});

/* ------------------ LOGIN ------------------ */
client.login(TOKEN);
