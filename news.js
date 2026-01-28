import axios from "axios";
import { parseStringPromise } from "xml2js";

const RSS_URL =
  "http://newsrss.bbc.co.uk/rss/sportonline_uk_edition/football/rss.xml";

function cleanHtml(x) {
  return (x ?? "").replace(/<[^>]*>/g, "").trim();
}

function makeItem(pick) {
  return {
    title: pick.title?.[0] ?? "Başlık yok",
    link: pick.link?.[0] ?? "",
    summary: cleanHtml(pick.description?.[0] ?? "")
  };
}

async function fetchItems() {
  const res = await axios.get(RSS_URL, { timeout: 15000 });
  const parsed = await parseStringPromise(res.data);
  const items = parsed?.rss?.channel?.[0]?.item ?? [];
  if (!items.length) throw new Error("RSS boş geldi.");
  return items;
}

export async function getDailyNews() {
  const items = await fetchItems();
  const pickFrom = items.slice(0, 5);
  const pick = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  return makeItem(pick);
}

export async function getTwoDailyNews() {
  const items = await fetchItems();
  if (items.length < 2) throw new Error("Yeterli haber yok.");

  const top = items.slice(0, 10);

  const a = top[Math.floor(Math.random() * top.length)];
  let b = top[Math.floor(Math.random() * top.length)];
  while (b?.link?.[0] === a?.link?.[0]) {
    b = top[Math.floor(Math.random() * top.length)];
  }

  return { noon: makeItem(a), evening: makeItem(b) };
}
