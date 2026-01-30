import axios from "axios";
import { parseStringPromise } from "xml2js";
import { SOURCES } from "./sources.js";

function cleanHtml(x) {
  return (x ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

async function fetchFromRss(source) {
  const res = await axios.get(source.rss, { timeout: 15000 });
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
    type: source.type, // RESMI / SOYLENTI
    lang: source.lang  // TR / EN
  };
}

export async function getNewsFromSources() {
  // 1) Rastgele kaynak seç
  const src = SOURCES[Math.floor(Math.random() * SOURCES.length)];
  return await fetchFromRss(src);
}

export async function getTwoNewsPack() {
  // hedef: 1 RESMI + 1 SOYLENTI (bulamazsa rastgele)
  const picked = [];

  async function tryGet(typeWanted) {
    for (let i = 0; i < 8; i++) {
      const n = await getNewsFromSources();
      const dup = picked.some((p) => p.link && p.link === n.link);
      if (dup) continue;
      if (n.type === typeWanted) return n;
    }
    return null;
  }

  let res = await tryGet("RESMI");
  if (!res) res = await getNewsFromSources();
  picked.push(res);

  let soy = await tryGet("SOYLENTI");
  if (!soy) soy = await getNewsFromSources();
  // aynı link gelirse bir kere daha dene
  if (picked[0].link && soy.link === picked[0].link) soy = await getNewsFromSources();
  picked.push(soy);

  return { first: picked[0], second: picked[1] };
}
