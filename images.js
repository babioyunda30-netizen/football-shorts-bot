import axios from "axios";
import { JSDOM } from "jsdom";

// Haberin sayfasından görselleri çek (og:image + img)
export async function fetchImagesFromArticle(url) {
  try {
    const res = await axios.get(url, {
      timeout: 20000,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });

    const dom = new JSDOM(res.data, { url });
    const doc = dom.window.document;

    const images = new Set();

    // og:image (en güvenilir)
    const og = doc.querySelector('meta[property="og:image"]');
    if (og?.content?.startsWith("http")) images.add(og.content);

    // twitter:image de bazen iyi olur
    const tw = doc.querySelector('meta[name="twitter:image"]');
    if (tw?.content?.startsWith("http")) images.add(tw.content);

    // img tagleri
    doc.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      const abs = src.startsWith("http") ? src : "";
      if (!abs) return;

      // basit filtre (logo/icon vs)
      const s = abs.toLowerCase();
      if (s.includes("logo") || s.includes("icon") || s.includes("sprite")) return;

      images.add(abs);
    });

    // 3 görsel yeter
    return Array.from(images).slice(0, 3);
  } catch {
    return [];
  }
}
