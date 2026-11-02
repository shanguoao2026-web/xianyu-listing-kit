import type { ServiceInput } from "./types.js";
import { clipCodePoints, escapeXml, formatPrice, hashString, lowestPrice, wrapCodePoints } from "./text.js";

interface Palette {
  bg: string;
  paper: string;
  accent: string;
  ink: string;
  muted: string;
  onBand: string;
}

export const PALETTES = [
  { bg: "#12312C", paper: "#F6F1E7", accent: "#E0A84A", ink: "#1A2420", muted: "#5E6A64", onBand: "#F6F1E7" },
  { bg: "#1B2838", paper: "#F4F7FB", accent: "#6FA8FF", ink: "#172033", muted: "#5A6A80", onBand: "#F4F7FB" },
  { bg: "#3A241C", paper: "#FBF5EF", accent: "#E07A4C", ink: "#2A1A14", muted: "#7A655B", onBand: "#FBF5EF" },
  { bg: "#241828", paper: "#F8F4FB", accent: "#C58BE0", ink: "#241828", muted: "#6E6278", onBand: "#F8F4FB" },
  { bg: "#10261C", paper: "#F2F7F3", accent: "#2F9B68", ink: "#12261C", muted: "#5D7368", onBand: "#F2F7F3" },
] as const satisfies readonly Palette[];

const FONT = "'PingFang SC','Noto Sans SC','Microsoft YaHei',sans-serif";

export function paletteIndex(seed: string): number {
  return hashString(seed) % PALETTES.length;
}

export function renderCoverSvg(service: ServiceInput): string {
  const seed = service.title_seed.trim() || "服务";
  const palette = PALETTES[paletteIndex(seed)];
  if (!palette) throw new Error("内部错误：调色板为空");
  const hero = wrapCodePoints(seed, 10, 3);
  const sub = wrapCodePoints(service.service.trim() || "服务", 18, 2);
  const min = lowestPrice(service.tiers);
  const price = min === null ? "" : `¥${formatPrice(min)} 起`;
  const tierLine = clipCodePoints(service.tiers.map((tier) => tier.name).join(" · "), 22);
  const cityLabel = service.city.trim() ? clipCodePoints(service.city.trim(), 8) : "";
  const subBase = 210 + hero.length * 74 + 36;
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" xml:lang="zh-CN">`,
    `<title>${escapeXml(seed)}</title>`,
    `<desc>${escapeXml(`${service.service} 封面${price ? `，${price}` : ""}`)}</desc>`,
    `<rect width="800" height="800" fill="${palette.bg}"/>`,
    `<rect x="48" y="48" width="704" height="560" fill="${palette.paper}"/>`,
    `<rect x="48" y="48" width="12" height="560" fill="${palette.accent}"/>`,
    `<rect x="48" y="624" width="704" height="128" fill="${palette.bg}"/>`,
    `<rect x="48" y="624" width="704" height="8" fill="${palette.accent}"/>`,
    text(80, 118, 20, 600, palette.accent, "闲鱼 · 服务"),
  ];
  if (cityLabel) lines.push(text(736, 118, 20, 500, palette.muted, cityLabel, "end"));
  hero.forEach((line, index) => {
    lines.push(text(80, 210 + index * 74, 60, 700, palette.ink, line));
  });
  sub.forEach((line, index) => {
    lines.push(text(80, subBase + index * 38, 26, 500, palette.muted, line));
  });
  lines.push(text(80, 680, 42, 700, palette.onBand, price));
  if (tierLine) lines.push(text(80, 726, 20, 500, palette.onBand, tierLine));
  lines.push(`</svg>`);
  return `${lines.join("\n")}\n`;
}

function text(
  x: number,
  y: number,
  size: number,
  weight: number,
  fill: string,
  content: string,
  anchor?: "end",
): string {
  const anchorAttr = anchor === "end" ? ` text-anchor="end"` : "";
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}"${anchorAttr}>${escapeXml(content)}</text>`;
}
