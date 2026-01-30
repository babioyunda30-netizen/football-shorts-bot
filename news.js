import axios from "axios";
import { parseStringPromise } from "xml2js";
import { SOURCES } from "./sources.js";

function cleanHtml(x) {
  return (x ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function clamp(s, n) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 3).trim() + "...";
}

function quickSummary(text) {
  const t = cleanHtml(text);
  if (!t) return "";
  // 2-3 kısa cümle hissi: ilk 260 karakter
  return clamp(t, 260);
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchFromRss(source) {
  const res = await axios.get(source.rss, { timeout: 20000 });
  const parsed = await parseStringPromise(res.data);

  const items =
    parsed?.rss?.channel?.[0]?.item ??
    parsed?.feed?.entry ??
    [];

  if (!items.length) throw new Error("RSS boş: " + source.name);

  const pick = items[Math.floor(Math.random() * items.length)];

  const titleRaw = pick.title?.[0] || pick.title || "";
  const descRaw =
    pick.description?.[0] ||
    pick.summary?.[0] ||
    pick["content:encoded"]?.[0] ||
    "";

  const link =
    pick.link?.[0]?.href ||
    pick.link?.[0] ||
    pick.guid?.[0]?._ ||
    pick.guid?.[0] ||
    "";

  const title = cleanHtml(titleRaw);
  const summary = quickSummary(descRaw);

  return {
    title: title || "Futbol haberi",
    summary: summary || "Özet alınamadı (kaynak metin kısa/boş).",
    link: link || source.rss,
    source: source.name,
    type: source.type, // RESMI / SOYLENTI
    lang: source.lang  // TR / EN
  };
}

export async function getNewsFromSources() {
  const list = shuffled(SOURCES);

  let lastErr = null;
  for (const src of list) {
    try {
      const n = await fetchFromRss(src);

      // Boş/çok kısa şeyleri ele
      if (!n.title || n.title.length < 6) continue;
      if (!n.link || n.link.length < 8) continue;

      return n;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }

  throw lastErr || new Error("Hiçbir kaynaktan haber çekilemedi.");
}

// ✅ Tek haber (index.js bunu kullanabilir)
export async function getDailyNews() {
  return getNewsFromSources();
}

// ✅ İki haber (paket)
export async function getTwoDailyNews() {
  // 1 RESMI + 1 SOYLENTI yakalamaya çalış
  const picked = [];

  async function pickType(typeWanted) {
    for (let i = 0; i < 12; i++) {
      const n = await getNewsFromSources();
      if (picked.some((p) => p.link === n.link)) continue;
      if (n.type === typeWanted) return n;
    }
    return null;
  }

  let a = await pickType("RESMI");
  if (!a) a = await getNewsFromSources();
  picked.push(a);

  let b = await pickType("SOYLENTI");
  if (!b) b = await getNewsFromSources();
  if (picked[0].link && b.link === picked[0].link) b = await getNewsFromSources();
  picked.push(b);

  return { noon: picked[0], evening: picked[1] };
}
