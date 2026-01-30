import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

// 1) Sayfanın TAM metnini çek
export async function fetchArticleText(url) {
  const res = await axios.get(url, {
    timeout: 25000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  });

  const dom = new JSDOM(res.data, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  // Readability bazen null dönebilir
  const text =
    article?.textContent?.replace(/\s+/g, " ").trim() ||
    dom.window.document.body?.textContent?.replace(/\s+/g, " ").trim() ||
    "";

  return text;
}

// 2) "AI gibi" özet: temizle + cümle puanla + en iyilerini seç + uzunluğu sabitle
export function summarizeText(text, maxSentences = 3) {
  const cleaned = normalizeForSummary(text);
  if (!cleaned) return "";

  const sentences = splitSentences(cleaned)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40);

  if (sentences.length === 0) return "";

  // Metin çok kısa ise direkt kısaltıp döndür
  if (sentences.length <= maxSentences) {
    return clampLength(sentences.join(" "), 420);
  }

  // Kelime frekansı + bilgi ipuçları ile puanla
  const freq = buildWordFreq(cleaned);
  const scored = sentences.map((s, idx) => {
    const score = scoreSentence(s, idx, freq);
    return { s, idx, score };
  });

  // En iyi cümleleri seç, sonra orijinal sıraya diz
  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, maxSentences).sort((a, b) => a.idx - b.idx);

  // Birleştir
  const out = picked.map((x) => polishSentence(x.s)).join(" ");
  return clampLength(out, 420);
}

/* ---------------- helpers ---------------- */

function normalizeForSummary(raw) {
  if (!raw) return "";

  let t = String(raw);

  // Çok sık görülen çöpleri temizle
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/Devamı için tıklayın.*$/i, "");
  t = t.replace(/Read more.*$/i, "");
  t = t.replace(/Click here to read.*$/i, "");
  t = t.replace(/Bu içeriğe abone olun.*$/i, "");
  t = t.replace(/Tüm hakları saklıdır.*$/i, "");
  t = t.replace(/Çerez.*?politikası.*$/i, "");

  // Çok tekrar eden menü/etiket gibi kısımlar bazen Readability’ye karışıyor:
  // aynı 3-5 kelimenin tekrarını azalt
  t = removeWeirdRepetitions(t);

  // Çok kısa metinleri ele
  if (t.length < 120) return t;

  return t;
}

function removeWeirdRepetitions(t) {
  // Aynı kelime 6+ kez arka arkaya tekrar ediyorsa kırp
  return t.replace(/\b(\w+)(\s+\1){5,}\b/gi, "$1");
}

function splitSentences(text) {
  // TR/EN karışık çalışacak şekilde: . ! ? sonrası böl
  return text.split(/(?<=[.!?])\s+/);
}

function buildWordFreq(text) {
  const stop = new Set([
    // TR
    "ve","veya","ama","fakat","ancak","bu","şu","o","bir","de","da","ile","için",
    "gibi","daha","çok","az","en","mi","mı","mu","mü","ise","olarak","kadar",
    "sonra","önce","çünkü","diye","hem","bile","yani","olan","oldu","olacağı",
    "etti","eden","dedi","diyor","diyen","diye",
    // EN
    "the","a","an","and","or","but","to","of","in","on","for","with","as","is","are","was","were",
    "be","been","it","this","that","from","by","at","after","before","about","into","over","under",
    "will","would","could","should","said","says"
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-zğüşöçı0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stop.has(w));

  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  return freq;
}

function scoreSentence(sentence, idx, freq) {
  const s = sentence.trim();
  const lower = s.toLowerCase();

  // 1) Kelime frekansı puanı (bilgi yoğunluğu)
  const words = lower
    .replace(/[^a-zğüşöçı0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  let score = 0;
  for (const w of words) score += freq.get(w) || 0;

  // 2) İsim/kurum/kişi (büyük harf ipucu) bonusu
  // (TR'de özel isimlerde işe yarar, EN'de de)
  const caps = (s.match(/\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]+/g) || []).length;
  score += Math.min(caps, 6) * 6;

  // 3) Sayı / tarih / skor bonusu (haberlerde önemli)
  const nums = (s.match(/\b\d{1,4}\b/g) || []).length;
  score += Math.min(nums, 4) * 8;

  // 4) Transfer/maç kelimeleri bonusu (futbol odaklı)
  const keywords = [
    "transfer","imza","anlaştı","anlaşma","kiralık","bonservis","resmi",
    "gol","kurtarış","penaltı","kırmızı","sarı","var","derbi","maç","skor",
    "injury","transfer","deal","goal","save","penalty","red card","var","match","score"
  ];
  let kwHits = 0;
  for (const k of keywords) if (lower.includes(k)) kwHits++;
  score += Math.min(kwHits, 5) * 10;

  // 5) Çok uzun cümleleri hafif kır (okunabilirlik)
  if (s.length > 220) score *= 0.85;

  // 6) Haberde ilk cümle genelde özet gibi → bonus
  if (idx === 0) score *= 1.15;
  if (idx === 1) score *= 1.05;

  return score;
}

function polishSentence(s) {
  // Cümle sonunu düzelt
  let out = s.replace(/\s+/g, " ").trim();
  // “..” gibi saçma bitişleri temizle
  out = out.replace(/\.\.+/g, ".");
  return out;
}

function clampLength(text, maxLen) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen).trim() + "...";
}

// 3) Ücretsiz EN->TR çeviri (MyMemory)
export async function translateToTR(text) {
  const t = (text || "").trim();
  if (!t) return "";

  // Çok uzunsa parça parça
  const chunks = splitByLength(t, 450);
  const out = [];

  for (const c of chunks) {
    const url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(c) +
      "&langpair=en|tr";

    const res = await axios.get(url, { timeout: 20000 });
    const tr = res?.data?.responseData?.translatedText || "";
    out.push(tr);
  }

  return out.join(" ").replace(/\s+/g, " ").trim();
}

function splitByLength(text, maxLen) {
  const parts = [];
  let i = 0;
  while (i < text.length) {
    parts.push(text.slice(i, i + maxLen));
    i += maxLen;
  }
  return parts;
}
