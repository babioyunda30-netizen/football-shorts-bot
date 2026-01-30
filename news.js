import axios from "axios";
import { parseStringPromise } from "xml2js";
import { SOURCES } from "./sources.js";

function cleanHtml(x) {
  return (x ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
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

  const title = pick.title?.[0] || pick.title || "";
  const summary = cleanHtml(
    pick.description?.[0] ||
      pick.summary?.[0] ||
      pick["content:encoded"]?.[0] ||
      ""
  );

  const link =
    pick.link?.[0]?.href ||
    pick.link?.[0] ||
    pick.guid?.[0]?._ ||
    pick.guid?.[0] ||
    "";

  return {
    title,
    summary,
    link,
    source: source.name,
    type: source.type,
    lang: source.lang
  };
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ✅ Burada fark: tek kaynak yerine çok kaynak deniyoruz
export async function getNewsFromSources() {
  const list = shuffled(SOURCES);

  let lastErr = null;
  for (const src of list) {
    try {
      const n = await fetchFromRss(src);

      // çok boş başlık/boş link gelirse başka kaynağa geç
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

export async function getTwoNewsPack() {
  const picked = [];

  async function getType(typeWanted) {
    for (let i = 0; i < 10; i++) {
      const n = await getNewsFromSources();
      const dup = picked.some((p) => p.link && p.link === n.link);
      if (dup) continue;
      if (n.type === typeWanted) return n;
    }
    return null;
  }

  let a = await getType("RESMI");
  if (!a) a = await getNewsFromSources();
  picked.push(a);

  let b = await getType("SOYLENTI");
  if (!b) b = await getNewsFromSources();
  if (picked[0].link && b.link === picked[0].link) b = await getNewsFromSources();
  picked.push(b);

  return { first: picked[0], second: picked[1] };
}
