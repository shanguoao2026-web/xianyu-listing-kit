import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { UserError } from "./errors.js";
import type { ServiceInput, Tier } from "./types.js";
import { isRecord } from "./types.js";
import { codePointLength, normalizeMatchText } from "./text.js";

const MAX_TITLE = 40;
const MAX_SERVICE = 120;
const MAX_CITY = 20;
const MAX_CONTACT = 40;
const MAX_TIER_NAME = 40;
const MAX_INCLUDE = 80;
const MAX_HIGHLIGHT = 80;
const MAX_PHRASE = 40;
const MAX_TIERS = 12;
const MAX_INCLUDES = 12;
const MAX_HIGHLIGHTS = 12;
const DEFAULT_CONTACT = "闲鱼内联系";

export function loadServiceFile(path: string): ServiceInput {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    const code = err instanceof Error && "code" in err ? String((err as { code?: unknown }).code) : "";
    if (code === "ENOENT") throw new UserError(`找不到文件：${path}`);
    throw new UserError(`无法读取 ${path}`);
  }
  return loadServiceYaml(text, path);
}

export function loadServiceYaml(text: string, filename = "service.yaml"): ServiceInput {
  if (text.trim() === "") throw new UserError(`${filename}: 文件是空的`);
  let doc: unknown;
  try {
    doc = parse(text, { uniqueKeys: true, strict: true }) as unknown;
  } catch (err) {
    if (err instanceof UserError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new UserError(`${filename}: YAML 解析失败：${message}`);
  }
  return normalizeService(doc, filename);
}

export function normalizeService(input: unknown, filename = "service"): ServiceInput {
  if (!isRecord(input)) throw new UserError(`${filename}: 顶层必须是键值对`);
  const title = cleanLine(input.title_seed, `${filename}: title_seed`, MAX_TITLE);
  const service = cleanLine(input.service, `${filename}: service`, MAX_SERVICE);
  const city = optionalLine(input.city, `${filename}: city`, MAX_CITY) ?? "";
  const contact = optionalLine(input.contact_hint, `${filename}: contact_hint`, MAX_CONTACT) ?? DEFAULT_CONTACT;
  const tiers = parseTiers(input.tiers, `${filename}: tiers`);
  const highlights = optionalStringList(input.highlights, `${filename}: highlights`, MAX_HIGHLIGHT, MAX_HIGHLIGHTS);
  const bannedExtra = dedupePhrases(optionalPhraseList(input.banned_extra, `${filename}: banned_extra`));
  const bannedAllow = dedupePhrases(optionalPhraseList(input.banned_allow, `${filename}: banned_allow`));
  return {
    title_seed: title,
    service,
    city,
    tiers,
    highlights,
    contact_hint: contact,
    banned_extra: bannedExtra,
    banned_allow: bannedAllow,
  };
}

function parseTiers(value: unknown, path: string): Tier[] {
  if (!Array.isArray(value) || value.length === 0) throw new UserError(`${path} 至少需要 1 个套餐`);
  if (value.length > MAX_TIERS) throw new UserError(`${path} 最多 ${MAX_TIERS} 个套餐`);
  return value.map((item, index) => parseTier(item, `${path}[${index}]`));
}

function parseTier(value: unknown, path: string): Tier {
  if (!isRecord(value)) throw new UserError(`${path} 必须是套餐对象`);
  const name = cleanLine(value.name, `${path}.name`, MAX_TIER_NAME);
  const price = parsePrice(value.price, `${path}.price`);
  if (!Array.isArray(value.includes) || value.includes.length === 0) {
    throw new UserError(`${path}.includes 至少需要 1 项`);
  }
  if (value.includes.length > MAX_INCLUDES) throw new UserError(`${path}.includes 最多 ${MAX_INCLUDES} 项`);
  const includes = value.includes.map((item, index) => cleanLine(item, `${path}.includes[${index}]`, MAX_INCLUDE));
  return { name, price, includes };
}

function parsePrice(value: unknown, path: string): number {
  let amount: number;
  if (typeof value === "number") amount = value;
  else if (typeof value === "string" && /^(?:\d+)(?:\.\d+)?$/.test(value.trim())) amount = Number(value.trim());
  else throw new UserError(`${path} 必须是大于等于 0 的数字`);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
    throw new UserError(`${path} 必须是 0 到 1000000 之间的数字`);
  }
  return Math.round(amount * 100) / 100;
}

function optionalStringList(value: unknown, path: string, itemMax: number, maxItems: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new UserError(`${path} 必须是字符串列表`);
  if (value.length > maxItems) throw new UserError(`${path} 最多 ${maxItems} 项`);
  return value.map((item, index) => cleanLine(item, `${path}[${index}]`, itemMax));
}

function optionalPhraseList(value: unknown, path: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new UserError(`${path} 必须是字符串列表`);
  return value.map((item, index) => cleanPhrase(item, `${path}[${index}]`));
}

function optionalLine(value: unknown, path: string, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return cleanLine(value, path, max);
}

function cleanLine(value: unknown, path: string, max: number): string {
  if (typeof value !== "string") throw new UserError(`${path} 必须是字符串`);
  const text = value.trim();
  if (text === "") throw new UserError(`${path} 不能是空字符串`);
  if (/[\r\n]/.test(text)) throw new UserError(`${path} 不能包含换行`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) throw new UserError(`${path} 含有控制字符`);
  if (codePointLength(text) > max) throw new UserError(`${path} 超过 ${max} 个字`);
  if (text.includes("<!-- xianyu-listing-kit") || /^【变体\s+\d+｜(?:专业|口语|短平快)】$/m.test(text)) {
    throw new UserError(`${path} 含有保留标记，请改写`);
  }
  return text;
}

function cleanPhrase(value: unknown, path: string): string {
  const text = cleanLine(value, path, MAX_PHRASE);
  if (codePointLength(text) < 2) throw new UserError(`${path} 至少 2 个字`);
  if (normalizeMatchText(text).norm.length < 2) throw new UserError(`${path} 至少 2 个有效字符`);
  return text;
}

function dedupePhrases(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const phrase of list) {
    const key = normalizeMatchText(phrase).norm;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
  }
  return out;
}
