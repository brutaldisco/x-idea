import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const PAPER = "#F6F3EB";
const INK = "#2A3040";
const ACCENT = "#4B6FD6";

function svg(size: number, padRatio: number): Buffer {
  const pad = size * padRatio;
  const font = Math.round((size - pad * 2) * 0.72);
  const markW = Math.round((size - pad * 2) * 0.22);
  const markH = Math.max(4, Math.round(size * 0.03));
  const markY = Math.round(size * 0.72);
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${PAPER}"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${font}" font-weight="600" fill="${INK}">M</text>
  <rect x="${(size - markW) / 2}" y="${markY}" width="${markW}" height="${markH}" rx="${markH / 2}" fill="${ACCENT}"/>
</svg>`;
  return Buffer.from(markup);
}

async function writePng(file: string, size: number, padRatio: number) {
  await sharp(svg(size, padRatio), { density: 144 }).png().toFile(file);
}

const root = process.cwd();
const icons = path.join(root, "public/icons");
const app = path.join(root, "src/app");

await mkdir(icons, { recursive: true });
await writePng(path.join(icons, "icon-192.png"), 192, 0.1);
await writePng(path.join(icons, "icon-512.png"), 512, 0.1);
await writePng(path.join(icons, "maskable-192.png"), 192, 0.2);
await writePng(path.join(icons, "maskable-512.png"), 512, 0.2);
await writePng(path.join(app, "icon.png"), 32, 0.1);
await writePng(path.join(app, "apple-icon.png"), 180, 0.12);
console.log("wrote PWA icons");
