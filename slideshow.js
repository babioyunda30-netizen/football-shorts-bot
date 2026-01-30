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

// ✅ drawtext için %100 güvenli escape
function ffmpegSafeText(text) {
  if (!text) return "";
  return String(text)
    .replace(/\\/g, "\\\\")   // \
    .replace(/:/g, "\\:")    // :
    .replace(/'/g, "\\'")    // '
    .replace(/"/g, '\\"')    // "
    .replace(/\n/g, "\\n")   // newline
    .replace(/\r/g, "")
    .replace(/%/g, "\\%")    // %
    .replace(/\[/g, "\\[")   // [
    .replace(/\]/g, "\\]");  // ]
}

export async function createSlideshowVideo({
  imageUrls,
  title,
  summary,
  outPath = "/tmp/videodemo.mp4",
  secondsPerSlide = 2
}) {
  const urls = (imageUrls || []).slice(0, 3);
  if (!urls.length) throw new Error("Görsel bulunamadı.");

  // Görselleri indir (indiremeyince atla)
  const localPaths = [];
  for (let i = 0; i < urls.length; i++) {
    const p = path.join("/tmp", `slide_${i + 1}.jpg`);
    try {
      await download(urls[i], p);
      localPaths.push(p);
    } catch (e) {
      console.error("IMG DOWNLOAD FAIL:", urls[i], e?.message || e);
    }
  }

  if (!localPaths.length) throw new Error("Görseller indirilemedi.");

  // 3 slayt yoksa sonuncuyu tekrar kullan
  while (localPaths.length < 3) localPaths.push(localPaths[localPaths.length - 1]);

  const durTotal = secondsPerSlide * 3;

  // Font yolu (Dockerfile fonts-dejavu-core ile gelir)
  const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

  const t1 = clamp(title, 90);
  const s1 = clamp(summary, 220);

  const titleLines = wrapLines(t1, 28, 3).join("\n");
  const sumLines = wrapLines(s1, 32, 4).join("\n");

  const safeTitle = ffmpegSafeText(titleLines);
  const safeSummary = ffmpegSafeText(sumLines);
  const safeBrand = ffmpegSafeText("@otomatikspor");

  // Render free stabil olsun diye 720x1280
  const commonScale = "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuv420p";
  const box1 = "box=1:boxcolor=black@0.45:boxborderw=18";
  const box2 = "box=1:boxcolor=black@0.35:boxborderw=18";

  // Slide 1: başlık
  const v0 =
    `[0:v]${commonScale},` +
    `drawtext=fontfile=${font}:text='${safeTitle}':fontsize=52:fontcolor=white:x=(w-text_w)/2:y=180:line_spacing=10:${box1},` +
    `fade=t=in:st=0:d=0.35,fade=t=out:st=${(secondsPerSlide - 0.35).toFixed(2)}:d=0.35[v0]`;

  // Slide 2: özet
  const v1 =
    `[1:v]${commonScale},` +
    `drawtext=fontfile=${font}:text='${safeSummary}':fontsize=38:fontcolor=white:x=(w-text_w)/2:y=260:line_spacing=12:${box2},` +
    `fade=t=in:st=0:d=0.35,fade=t=out:st=${(secondsPerSlide - 0.35).toFixed(2)}:d=0.35[v1]`;

  // Slide 3: marka
  const v2 =
    `[2:v]${commonScale},` +
    `drawtext=fontfile=${font}:text='${safeBrand}':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=860:${box2},` +
    `fade=t=in:st=0:d=0.35,fade=t=out:st=${(secondsPerSlide - 0.35).toFixed(2)}:d=0.35[v2]`;

  // Yapay sakin ses (telif yok)
  const a =
    `[3:a]volume=0.06[a1];` +
    `[4:a]volume=0.04[a2];` +
    `[a1][a2]amix=inputs=2,lowpass=f=1200,aecho=0.8:0.9:900:0.18,volume=0.9[a]`;

  const filterComplex =
    `${v0};${v1};${v2};` +
    `[v0][v1][v2]concat=n=3:v=1:a=0[v];` +
    `${a}`;

  // ffmpeg ile üret
  await exec("ffmpeg", [
    "-y",

    "-loop", "1", "-t", String(secondsPerSlide), "-i", localPaths[0],
    "-loop", "1", "-t", String(secondsPerSlide), "-i", localPaths[1],
    "-loop", "1", "-t", String(secondsPerSlide), "-i", localPaths[2],

    "-f", "lavfi", "-t", String(durTotal), "-i", "sine=frequency=220:sample_rate=44100",
    "-f", "lavfi", "-t", String(durTotal), "-i", "sine=frequency=330:sample_rate=44100",

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
