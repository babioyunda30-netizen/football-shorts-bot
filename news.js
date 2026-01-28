import axios from "axios";
import { parseStringPromise } from "xml2js";

export async function getDailyNews() {
  const rssUrl =
    "http://newsrss.bbc.co.uk/rss/sportonline_uk_edition/football/rss.xml";

  const res = await axios.get(rssUrl, { timeout: 15000 });
  const parsed = await parseStringPromise(res.data);

  const items = parsed?.rss?.channel?.[0]?.item ?? [];
  if (!items.length) throw new Error("RSS boş geldi.");

  // İlk 5 haberi al, rastgele seç
  const pickFrom = items.slice(0, 5);
  const pick = pickFrom[Math.floor(Math.random() * pickFrom.length)];

  const title = pick.title?.[0] ?? "Başlık yok";
  const link = pick.link?.[0] ?? "";
  const summary = (pick.description?.[0] ?? "")
    .replace(/<[^>]*>/g, "")
    .trim();

  return { title, link, summary };
}
