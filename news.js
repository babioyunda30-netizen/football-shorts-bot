import axios from "axios";
import { parseStringPromise } from "xml2js";

export async function getDailyNews() {
  const rssUrl =
    "http://newsrss.bbc.co.uk/rss/sportonline_uk_edition/football/rss.xml";

  const res = await axios.get(rssUrl);
  const parsed = await parseStringPromise(res.data);

  const items = parsed.rss.channel[0].item;

  // İlk 3 haberden birini seç (basit başlangıç)
  const pick = items[Math.floor(Math.random() * 3)];

  return {
    title: pick.title[0],
    link: pick.link[0],
    summary: pick.description[0]
  };
}
