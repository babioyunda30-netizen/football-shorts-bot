import { execFile } from "node:child_process";
import { promisify } from "node:util";
import axios from "axios";
import fs from "node:fs";
import path from "node:path";

const exec = promisify(execFile);

async function download(url, filepath) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 25000,
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  fs.writeFileSync(filepath, res.data);
  return filepath;
}

function clamp(s, n) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 3).trim() + "...";
}

function wrapLines(text, maxLen = 28, maxLines = 3) {
  const words = (text || "").replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let cur = "";

  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxLen) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

export async function createSlideshowVideo({
  imageUrls,
  title,
  summary,
  outPath = "/tmp/videodemo.mp4",
  secondsPerSlide = 2
}) {
  const urls = (imageUrls || []).slice(0, 3);
  if (!urls.length) throw new Error("Görsel yok");

  // Görselleri indir
  const localPaths = [];
  for (let i = 0; i < urls.length; i++) {
    const p = path.join("/tmp", `slide_${i + 1}.jpg`);
    try {
      await download(urls[i], p);
      localPaths.push(p);
    } catch {}
  }
  if (!localPaths.length) throw new Error("Görseller indirilemedi");

  while (localPaths.length < 3) localPaths.push(localPaths[localPaths.length - 1]);

  // METİNLERİ DOSYA OLARAK YAZ (KRİTİK NOKTA)
  const titleText =
    wrapLines(clamp(title, 90), 28, 3).join("\n");
  const summaryText =
    wrapLines(clamp(summary, 220), 32, 4).join("\n");

  const titleFile = "/tmp/title.txt";
  const summaryFile = "/tmp/summary.txt";
  const brandFile = "/tmp/brand.txt";

  fs.writeFileSync(titleFile, titleText, "utf8");
  fs.writeFileSync(summaryFile, summaryText, "utf8");
  fs.writeFileSync(brandFile, "@otomatikspor", "utf8");

  const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  const durTotal = secondsPerSlide * 3;

  const scale = "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuv420p";
  const box1 = "box=1:boxcolor=black@0.45:boxborderw=18";
  const box2 = "box=1:boxcolor=black@0.35:boxborderw=18";

  const v0 =
    `[0:v]${scale},` +
    `drawtext=fontfile=${font}:textfile=${titleFile}:fontsize=52:fontcolor=white:x=(w-text_w)/2:y=180:line_spacing=10:${box1},` +
    `fade=t=in:st=0:d=0.35,fade=t=out:st=1.65:d=0.35[v0]`;

  const v1 =
    `[1:v]${scale},` +
    `drawtext=fontfile=${font}:textfile=${summaryFile}:fontsize=38:fontcolor=white:x=(w-text_w)/2:y=260:line_spacing=12:${box2},` +
    `fade=t=in:st=0:d=0.35,fade=t=out:st=1.65:d=0.35[v1]`;

  const v2 =
    `[2:v]${scale},` +
    `drawtext=fontfile=${font}:textfile=${brandFile}:fontsize=42:fontcolor=white:x=(w-text_w)/2:y=860:${box2},` +
    `fade=t=in:st=0:d=0.35,fade=t=out:st=1.65:d=0.35[v2]`;

  const audio =
    `[3:a]volume=0.06[a1];` +
    `[4:a]volume=0.04[a2];` +
    `[a1][a2]amix=inputs=2,lowpass=f=1200,aecho=0.8:0.9:900:0.18,volume=0.9[a]`;

  const filterComplex =
    `${v0};${v1};${v2};` +
    `[v0][v1][v2]concat=n=3:v=1:a=0[v];` +
    `${audio}`;

  await exec("ffmpeg", [
    "-y",

    "-loop", "1", "-t", String(secondsPerSlide), "-i", localPaths[0],
    "-loop", "1", "-t", String(secondsPerSlide), "-i", localPaths[1],
    "-loop", "1", "-t", String(secondsPerSlide), "-i", localPaths[2],

    "-f", "lavfi", "-t", String(durTotal), "-i", "sine=frequency=220",
    "-f", "lavfi", "-t", String(durTotal), "-i", "sine=frequency=330",

    "-filter_complex", filterComplex,
    "-map", "[v]",
    "-map", "[a]",

    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "28",
    "-pix_fmt", "yuv420p",
    "-r", "30",

    "-c:a", "aac",
    "-shortest",

    outPath
  ]);

  return outPath;
}
