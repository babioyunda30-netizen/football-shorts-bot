import { execFile } from "node:child_process";
import { promisify } from "node:util";
import axios from "axios";
import fs from "node:fs";
import path from "node:path";

const exec = promisify(execFile);

async function download(url, filepath) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 25000 });
  fs.writeFileSync(filepath, res.data);
  return filepath;
}

function clamp(s, n) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 3).trim() + "...";
}

function escapeDrawtext(s) {
  return (s || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

// Basit satır bölme (telefonda okunur olsun)
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
  secondsPerSlide = 3
}) {
  const imgs = (imageUrls || []).slice(0, 3);
  if (imgs.length === 0) throw new Error("Görsel bulunamadı.");

  // /tmp içine indir
  const localPaths = [];
  for (let i = 0; i < imgs.length; i++) {
    const p = path.join("/tmp", `slide_${i + 1}.jpg`);
    try {
      await download(imgs[i], p);
      localPaths.push(p);
    } catch {
      // indirilemeyen görseli atla
    }
  }
  if (localPaths.length === 0) throw new Error("Görseller indirilemedi.");

  // 3 slide’a kadar tamamla (1-2 görsel geldiyse tekrar kullan)
  while (localPaths.length < 3) localPaths.push(localPaths[localPaths.length - 1]);
  const durTotal = secondsPerSlide * 3;

  const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

  const t1 = clamp(title, 90);
  const s2 = clamp(summary, 220);

  const titleLines = wrapLines(t1, 28, 3);
  const sumLines = wrapLines(s2, 32, 4);

  // drawtext katmanları: başlık + özet
  const titleText = escapeDrawtext(titleLines.join("\\n"));
  const sumText = escapeDrawtext(sumLines.join("\\n"));

  // Video filtreleri (9:16 + yumuşak yazı kutusu)
  const commonScale = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p";
  const box1 = "box=1:boxcolor=black@0.45:boxborderw=18";
  const box2 = "box=1:boxcolor=black@0.35:boxborderw=18";

  const v0 = `[0:v]${commonScale},` +
    `drawtext=fontfile=${font}:text='${titleText}':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=240:line_spacing=10:${box1},` +
    `fade=t=in:st=0:d=0.4,fade=t=out:st=2.6:d=0.4[v0]`;

  const v1 = `[1:v]${commonScale},` +
    `drawtext=fontfile=${font}:text='${sumText}':fontsize=44:fontcolor=white:x=(w-text_w)/2:y=360:line_spacing=12:${box2},` +
    `fade=t=in:st=0:d=0.4,fade=t=out:st=2.6:d=0.4[v1]`;

  const v2 = `[2:v]${commonScale},` +
    `drawtext=fontfile=${font}:text='@otomatikspor':fontsize=46:fontcolor=white:x=(w-text_w)/2:y=900:${box2},` +
    `fade=t=in:st=0:d=0.4,fade=t=out:st=2.6:d=0.4[v2]`;

  // Yapay “sakin” ambient ses (telif yok)
  // 2 sine + düşük ses + lowpass + echo
  const a =
    `[3:a]volume=0.06[a1];` +
    `[4:a]volume=0.04[a2];` +
    `[a1][a2]amix=inputs=2,lowpass=f=1200,aecho=0.8:0.9:900:0.18,volume=0.9[a]`;

  const filterComplex =
    `${v0};${v1};${v2};` +
    `[v0][v1][v2]concat=n=3:v=1:a=0[v];` +
    `${a}`;

  // ffmpeg komutu
  // -loop 1 ile resimleri video gibi okutuyoruz
  await exec("ffmpeg", [
    "-y",

    "-loop", "1", "-t", String(secondsPerSlide), "-i", localPaths[0],
    "-loop", "1", "-t", String(secondsPerSlide), "-i", localPaths[1],
    "-loop", "1", "-t", String(secondsPerSlide), "-i", localPaths[2],

    // 2 katmanlı ambient ses üret
    "-f", "lavfi", "-t", String(durTotal), "-i", "sine=frequency=220:sample_rate=44100",
    "-f", "lavfi", "-t", String(durTotal), "-i", "sine=frequency=330:sample_rate=44100",

    "-filter_complex", filterComplex,
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-c:a", "aac",
    "-shortest",
    outPath
  ]);

  return outPath;
    }
