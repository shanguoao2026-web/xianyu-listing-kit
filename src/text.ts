import { UserError } from "./errors.js";
import { DEFAULT_LIMITS } from "./rules.js";

export function codePointLength(input: string): number {
  return [...input].length;
}

export function codePointSlice(input: string, start: number, end: number): string {
  return [...input].slice(start, end).join("");
}

const TITLE_GAP = new Set([" ", "\u3000", "\n", "\r", "\t"]);
const TRAILING_PUNCT = /[｜、，,：:·|]+$/u;

export function fitTitle(raw: string, min = DEFAULT_LIMITS.titleMin, max = DEFAULT_LIMITS.titleMax): string {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    throw new UserError(`标题长度范围无效：${min} 到 ${max}`);
  }
  let text = "";
  for (const ch of raw.trim()) {
    if (!TITLE_GAP.has(ch)) text += ch;
  }
  text = text.replace(/｜{2,}/g, "｜");
  if (text === "｜") text = "";

  if (codePointLength(text) > max) {
    text = codePointSlice(text, 0, max).replace(TRAILING_PUNCT, "");
  }
  if (codePointLength(text) < min) {
    const glue = text.length === 0 || text.endsWith("｜") ? "" : "｜";
    text = `${text}${glue}服务说明`;
  }
  while (codePointLength(text) < min && codePointLength(text) < max) {
    text += "服务";
  }
  if (codePointLength(text) > max) {
    text = codePointSlice(text, 0, max).replace(TRAILING_PUNCT, "");
  }
  if (codePointLength(text) < min) {
    text = codePointSlice(`${text}服务说明刊登`, 0, max);
  }
  return text;
}

export function formatPrice(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  const cents = Math.round(amount * 100);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const yuan = Math.trunc(abs / 100);
  const rem = abs % 100;
  let body: string;
  if (rem === 0) body = String(yuan);
  else if (rem % 10 === 0) body = `${yuan}.${rem / 10}`;
  else body = `${yuan}.${String(rem).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

export function lowestPrice(tiers: readonly { price: number }[]): number | null {
  let min = Infinity;
  for (const tier of tiers) {
    if (typeof tier.price === "number" && tier.price < min) min = tier.price;
  }
  return min === Infinity ? null : min;
}

export function charWidth(codePoint: number): number {
  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff)
  ) {
    return 2;
  }
  return 1;
}

export function displayWidth(input: string): number {
  let width = 0;
  for (const ch of input) {
    const codePoint = ch.codePointAt(0);
    if (codePoint === undefined) continue;
    width += charWidth(codePoint);
  }
  return width;
}

const XML_ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function escapeXml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => XML_ESC[ch] ?? ch);
}

const MATCH_SKIP = /[\s._·•\-—~～]/u;

/** NFKC、小写，并去掉空白和常见间隔符，便于抓住「加 v.x」这类写法。 */
export function normalizeMatchText(input: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  for (let index = 0; index < input.length; ) {
    const codePoint = input.codePointAt(index);
    if (codePoint === undefined) break;
    const raw = String.fromCodePoint(codePoint);
    const folded = raw.normalize("NFKC").toLowerCase();
    for (const ch of folded) {
      if (MATCH_SKIP.test(ch)) continue;
      norm += ch;
      map.push(index);
    }
    index += raw.length;
  }
  return { norm, map };
}

export function indexToLineCol(text: string, index: number): { line: number; column: number } {
  const safe = Math.max(0, Math.min(index, text.length));
  let line = 1;
  let column = 1;
  for (let i = 0; i < safe; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

export function hashString(input: string): number {
  let hash = 2166136261;
  for (const ch of input) {
    const codePoint = ch.codePointAt(0);
    if (codePoint === undefined) continue;
    hash ^= codePoint;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function wrapCodePoints(input: string, perLine: number, maxLines: number): string[] {
  if (perLine < 1 || maxLines < 1) throw new Error("内部错误：换行参数无效");
  const chars = [...input];
  if (chars.length === 0) return [""];
  const limit = perLine * maxLines;
  const truncated = chars.length > limit;
  const visible = truncated ? chars.slice(0, limit) : chars;
  const lines: string[] = [];
  for (let i = 0; i < visible.length; i += perLine) {
    lines.push(visible.slice(i, i + perLine).join(""));
  }
  if (truncated && lines.length > 0) {
    const last = lines[lines.length - 1] ?? "";
    const lastChars = [...last];
    if (lastChars.length > 0) {
      lastChars[lastChars.length - 1] = "…";
      lines[lines.length - 1] = lastChars.join("");
    }
  }
  return lines;
}

export function clipCodePoints(input: string, max: number): string {
  const chars = [...input];
  if (max < 1) return "";
  if (chars.length <= max) return input;
  if (max === 1) return "…";
  return `${chars.slice(0, max - 1).join("")}…`;
}
