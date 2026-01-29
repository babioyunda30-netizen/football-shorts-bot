import axios from "axios";
import { parseStringPromise } from "xml2js";
import { SOURCES } from "./sources.js";

function cleanHtml(x) {
  return (x ?? "").replace(/<[^>]*>/g, "").trim();
}

export async function getNewsFromSources() {
  const pickedSource =
    SOURCES[Math.floor(Math.random() * SOURCES.length)];

  const res = await axios.get(pickedSource.rss, { timeout: 15000 });
  const parsed = await parseStringPromise(res.data);

  const items =
    parsed?.rss?.channel?.[0]?.item ??
    parsed?.feed?.entry ??
    [];

  if (!items.length) throw new Error("Haber bulunamadı");

  const pick = items[Math.floor(Math.random() * items.length)];

  return {
    title: pick.title?.[0] || pick.title,
    summary: cleanHtml(
      pick.description?.[0] ||
      pick.summary?.[0] ||
      ""
    ),
    link: pick.link?.[0]?.href || pick.link?.[0] || "",
    source: pickedSource.name,
    type: pickedSource.type,
    lang: pickedSource.lang
  };
}
