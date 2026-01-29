import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

// 1) Sayfanın TAM metnini çek (okunabilir içerik)
export async function fetchArticleText(url) {
  const res = await axios.get(url, {
    timeout: 20000,
    headers: {
      // Bazı siteler botları engellemesin diye
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
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

// 2) Basit özet (tamamen ücretsiz, LLM yok)
// Çok uzun metni kısaltır: ilk cümleler + kelime frekansı ile seçme
export function summarizeText(text, maxSentences = 3) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  // Cümlelere böl (TR/EN idare eder)
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);

  if (sentences.length <= maxSentences) return sentences.join(" ");

  // Kelime frekansı
  const stop = new Set([
    "ve","veya","ama","fakat","ancak","bu","şu","o","bir","de","da","ile","için",
    "the","a","an","and","or","but","to","of","in","on","for","with","as","is","are","was","were"
  ]);

  const words = cleaned
    .toLowerCase()
    .replace(/[^a-zğüşöçı0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stop.has(w));

  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);

  // Cümle puanla
  const scored = sentences.map((s, idx) => {
    const sw = s
      .toLowerCase()
      .replace(/[^a-zğüşöçı0-9\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stop.has(w));

    let score = 0;
    for (const w of sw) score += freq.get(w) || 0;

    // Çok baştaki cümlelere minik bonus (haberlerde önemli olur)
    if (idx === 0) score *= 1.15;

    return { s, idx, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, maxSentences).sort((a, b) => a.idx - b.idx);

  return picked.map((x) => x.s).join(" ");
}

// 3) Ücretsiz EN->TR çeviri (MyMemory)
// Not: ücretsiz olduğu için bazen rate-limit olabilir.
export async function translateToTR(text) {
  const t = (text || "").trim();
  if (!t) return "";

  // Çok uzunsa parça parça
  const chunks = splitByLength(t, 450); // MyMemory link limitini aşmayalım
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
