import { Client, GatewayIntentBits } from "discord.js";
import http from "node:http";
import cron from "node-cron";
import fs from "node:fs";

import { getNewsFromSources, getTwoNewsPack } from "./news.js";
import { fetchArticleText, summarizeText, translateToTR } from "./article.js";

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

// ---- Karar kaydı (FAZ 1) ----
function loadDecisions() {
  try {
    const raw = fs.readFileSync("./decisions.json", "utf-8");
    return JSON.parse(raw);
  } catch {
    return {
      oglen: { kalsin: 0, sil: 0 },
      aksam: { kalsin: 0, sil: 0 }
    };
  }
}

function saveDecisions(data) {
  fs.writeFileSync("./decisions.json", JSON.stringify(data, null, 2));
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

function packMessageSimple(d) {
  // Eski "gunluk" formatı (sonra istersen bunu da yeni sisteme geçiririz)
  return (
    `📅 **Günlük 2 içerik önerisi**\n\n` +
    `🕛 **Öğlen (12:30)**\n**${d.noon.title}**\n${d.noon.summary}\nKaynak: ${d.noon.link}\n\n` +
    `🌙 **Akşam (20:30)**\n**${d.evening.title}**\n${d.evening.summary}\nKaynak: ${d.evening.link}\n\n` +
    `Komutlar:\n- "oglen kalsin" / "oglen sil"\n- "aksam kalsin" / "aksam sil"`
  );
}

function buildHeader(n) {
  const turEmoji = n.type === "RESMI" ? "🟢" : "🟡";
  const turText = n.type === "RESMI" ? "Resmî" : "Söylenti";
  // Dil sabit: hep Türkçe görünsün
  const dilText = "Türkçe";
  return `${turEmoji} Tür: ${turText}\n📰 Kaynak: ${n.source}\n🌍 Dil: ${dilText}\n`;
}

async function buildNewsMessage(n) {
  // 1) Tam metni çek
  let fullText = "";
  try {
    if (n.link) fullText = await fetchArticleText(n.link);
  } catch (e) {
    console.error("Makale çekilemedi:", e?.message || e);
  }

  // 2) Özetle: tam metin varsa onu, yoksa RSS summary
  const baseText =
    fullText && fullText.length > 200
      ? fullText
      : (n.summary || "");

  let ozetTR = summarizeText(baseText, 3);

  // Fallback: özet boşsa RSS'ye düş
  if (!ozetTR || ozetTR.length < 40) {
    ozetTR = (n.summary || "").replace(/\s+/g, " ").trim();
  }
  if (!ozetTR || ozetTR.length < 40) {
    ozetTR = "Bu haber kaynağı metni kısa verdi/engelledi, özet çıkarılamadı.";
  }

  // 3) İngilizce kaynaksa -> Türkçe çeviri ekle
  let ceviriBilgi = "";
  if (n.lang === "EN") {
    try {
      const tr = await translateToTR(ozetTR);
      if (tr) {
        ceviriBilgi = `\n\n🈶 **Çeviri (TR):**\n${tr}`;
      }
    } catch (e) {
      console.error("Çeviri hatası:", e?.message || e);
    }
  }

  // Mesaj
  return (
    `${buildHeader(n)}\n` +
    `**${n.title}**\n` +
    `${ozetTR}` +
    `${ceviriBilgi}\n\n` +
    `🔗 Kaynak: ${n.link}`
  );
}

client.once("ready", async () => {
  console.log(`Bot hazır: ${client.user.tag}`);
  await dm("🤖 Bot çalışıyor. DM testi başarılı!");

  // Otomatik DM saatleri (UTC üzerinden)
  cron.schedule(
    "30 8 * * *",
    async () => {
      try {
        // Şimdilik eski sistem: (istersen yarın bunu da yeni formatla yaparız)
        // Burada otomatik 2 haber yerine 1 haber de atabiliriz.
        const n = await getNewsFromSources();
        const text = await buildNewsMessage(n);
        await dm("⏰ **Otomatik haber (Öğlen)**\n\n" + text);
      } catch (e) {
        console.error(e);
        await dm("❌ Otomatik haber (öğlen) hazırlanamadı.");
      }
    },
    { timezone: "UTC" }
  );

  cron.schedule(
    "30 16 * * *",
    async () => {
      try {
        const n = await getNewsFromSources();
        const text = await buildNewsMessage(n);
        await dm("⏰ **Otomatik haber (Akşam)**\n\n" + text);
      } catch (e) {
        console.error(e);
        await dm("❌ Otomatik haber (akşam) hazırlanamadı.");
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

  // Çeviri testi
  if (t === "bbc") {
    try {
      const textEN =
        "Breaking: A top club is in talks for a new striker as fans react online.";
      const tr = await translateToTR(textEN);

      await msg.reply(
        `🧪 **Çeviri Testi**\n\n` +
          `🇬🇧 EN:\n${textEN}\n\n` +
          `🇹🇷 TR:\n${tr}`
      );
    } catch (e) {
      console.error(e);
      await msg.reply("❌ Çeviri testi başarısız oldu.");
    }
    return;
  }

  // Haber (çoklu kaynak + özet + EN ise TR çeviri)
  if (t === "haber") {
    try {
      const n = await getNewsFromSources();
      const text = await buildNewsMessage(n);
      await msg.reply(text);
    } catch (e) {
      console.error(e);
      await msg.reply("❌ Haber çekemedim.");
    }
    return;
  }

  // (Opsiyonel) Günlük komutu: şimdilik kapatıyorum çünkü eski news.js'le uyumluydu.
  // İstersen yarın "gunluk"ü de yeni sistemle 2 haber atacak şekilde yazarız.
  if (t === "gunluk") {
    await msg.reply("ℹ️ 'gunluk' komutunu sonra yeni sisteme uyarlayacağız. Şimdilik 'haber' kullan.");
    return;
  }

  // ---- Karar komutları ----
  if (t === "oglen sil") {
    const d = loadDecisions();
    d.oglen.sil++;
    saveDecisions(d);
    await msg.reply("🗑️ Öğlen içeriği SİLİNSİN olarak kaydedildi.");
    return;
  }

  if (t === "oglen kalsin") {
    const d = loadDecisions();
    d.oglen.kalsin++;
    saveDecisions(d);
    await msg.reply("✅ Öğlen içeriği KALSIN olarak kaydedildi.");
    return;
  }

  if (t === "aksam sil") {
    const d = loadDecisions();
    d.aksam.sil++;
    saveDecisions(d);
    await msg.reply("🗑️ Akşam içeriği SİLİNSİN olarak kaydedildi.");
    return;
  }

  if (t === "aksam kalsin") {
    const d = loadDecisions();
    d.aksam.kalsin++;
    saveDecisions(d);
    await msg.reply("✅ Akşam içeriği KALSIN olarak kaydedildi.");
    return;
  }
});

client.login(TOKEN);
