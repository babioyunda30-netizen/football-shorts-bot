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
export async function getTwoNewsPack() {
  // 1) Resmî + 1) Söylenti yakalamaya çalış
  const want = ["RESMI", "SOYLENTI"];
  const picked = [];

  for (const type of want) {
    let got = null;

    for (let i = 0; i < 6; i++) {
      const n = await getNewsFromSources();

      // aynı link tekrar gelmesin
      const dup = picked.some((p) => p.link && p.link === n.link);
      if (dup) continue;

      if (n.type === type) {
        got = n;
        break;
      }
    }

    // bulunamazsa rastgele bir haberle doldur
    if (!got) {
      for (let i = 0; i < 6; i++) {
        const n = await getNewsFromSources();
        const dup = picked.some((p) => p.link && p.link === n.link);
        if (dup) continue;
        got = n;
        break;
      }
    }

    if (got) picked.push(got);
  }

  // her ihtimale karşı 2 tane yoksa tamamla
  while (picked.length < 2) {
    const n = await getNewsFromSources();
    const dup = picked.some((p) => p.link && p.link === n.link);
    if (!dup) picked.push(n);
  }

  return { first: picked[0], second: picked[1] };
}

}
