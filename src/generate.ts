import { assertNever, UserError } from "./errors.js";
import { renderCoverSvg } from "./cover.js";
import { normalizeService } from "./load-service.js";
import { renderPriceTableMarkdown, renderPriceTablePlain } from "./price-table.js";
import type { Angle, GenerateResult, ServiceInput, Tone, ToneChoice, Variant } from "./types.js";
import { ANGLES, TONES } from "./types.js";
import { fitTitle, formatPrice, lowestPrice } from "./text.js";

export interface GenerateOptions {
  variants?: number;
  tone?: ToneChoice;
}

const PRO_ANGLE: Record<Angle, string> = {
  scope: "本条侧重服务内容：做什么、不默认包含什么。",
  speed: "本条侧重工期：交付时间以套餐原文为准，没有写明就不算约定。",
  local: "本条侧重地点：能否当面确认只看城市和亮点，不另作承诺。",
  price: "本条侧重价格：只按下列套餐计价。",
  revision: "本条侧重修改：次数和范围看套餐括号内的说明。",
};

const CASUAL_ANGLE: Record<Angle, string> = {
  scope: "这次先说清楚做什么。",
  speed: "这次先说工期，写几天就是几天。",
  local: "这次先说地点，方便的话按亮点来。",
  price: "这次先说价格，就表上这些。",
  revision: "这次先说修改，次数都在括号里。",
};

export function generateListings(input: ServiceInput | unknown, options: GenerateOptions = {}): GenerateResult {
  const service = normalizeService(input);
  const variants = options.variants ?? 3;
  const tone = options.tone ?? "all";
  if (!Number.isInteger(variants) || variants < 1 || variants > 8) {
    throw new UserError(`变体数量需要是 1 到 8 的整数，收到 ${String(variants)}`);
  }
  if (tone !== "all" && !isTone(tone)) throw new UserError(`不支持的语气：${String(tone)}`);
  const planned = planVariants(variants, tone).map((item, index) => {
    const variant: Variant = {
      index: index + 1,
      tone: item.tone,
      angle: item.angle,
      title: fitTitle(`${service.title_seed}｜${titleSuffix(service, item.angle)}`),
      body: renderBody(service, item.tone, item.angle),
    };
    return variant;
  });
  return {
    service,
    requestedTone: tone,
    variants: planned,
    priceMarkdown: renderPriceTableMarkdown(service),
    pricePlain: renderPriceTablePlain(service),
    coverSvg: renderCoverSvg(service),
  };
}

function planVariants(count: number, tone: ToneChoice): Array<{ tone: Tone; angle: Angle }> {
  const plan: Array<{ tone: Tone; angle: Angle }> = [];
  for (let index = 0; index < count; index += 1) {
    const picked = tone === "all" ? TONES[index % TONES.length] : tone;
    const angle = ANGLES[index % ANGLES.length];
    if (picked === undefined || angle === undefined) throw new Error("内部错误：语气或角度为空");
    plan.push({ tone: picked, angle });
  }
  return plan;
}

function isTone(value: string): value is Tone {
  return value === "pro" || value === "casual" || value === "short";
}

function titleSuffix(service: ServiceInput, angle: Angle): string {
  switch (angle) {
    case "scope":
      return condense(service.service);
    case "speed":
      return "按套餐工期";
    case "local":
      if (service.city && !service.title_seed.includes(service.city)) return `${service.city}本地`;
      return "本地服务";
    case "price": {
      const min = lowestPrice(service.tiers);
      return min === null ? "价格见套餐" : `¥${formatPrice(min)}起`;
    }
    case "revision":
      return "修改看套餐";
    default:
      return assertNever(angle);
  }
}

function condense(value: string): string {
  let out = "";
  for (const ch of value) {
    if (ch !== " " && ch !== "\u3000") out += ch;
  }
  return out || "服务";
}

function renderBody(service: ServiceInput, tone: Tone, angle: Angle): string {
  switch (tone) {
    case "pro":
      return renderPro(service, angle);
    case "casual":
      return renderCasual(service, angle);
    case "short":
      return renderShort(service, angle);
    default:
      return assertNever(tone);
  }
}

// 语气锚点与 src/rules.ts 的 TONE_KEYWORDS 对齐：专业「服务范围」，口语「随时聊」，短平快「价目」。
function renderPro(service: ServiceInput, angle: Angle): string {
  const place = service.city ? `服务城市：${service.city}。` : "服务城市：不限，可远程沟通。";
  return joinBlocks([
    `承接${service.service}。${place}`,
    `服务范围：按套餐交付「${service.service}」。交付内容与修改次数只以套餐「包含」为准。`,
    PRO_ANGLE[angle],
    `套餐：\n${tierBullets(service)}`,
    highlightBlock(service.highlights),
    `沟通：${service.contact_hint}。下单前请在闲鱼确认用途、文件格式和期望时间。未写入套餐的事项需要另行约定。`,
  ]);
}

function renderCasual(service: ServiceInput, angle: Angle): string {
  const place = service.city ? `人在${service.city}，` : "";
  return joinBlocks([
    `${place}做${service.service}，随时聊。`,
    "价格和包含项写在下面，没写的先别当成包含。",
    CASUAL_ANGLE[angle],
    "看中哪一档就做哪一档，临时加内容要另外说。",
    tierBullets(service),
    highlightBlock(service.highlights),
    `直接${service.contact_hint}，把需求发过来就行。`,
  ]);
}

function renderShort(service: ServiceInput, angle: Angle): string {
  return joinBlocks([
    shortLead(service, angle),
    `价目：${service.tiers.map((tier) => `${tier.name}¥${formatPrice(tier.price)}`).join(" / ")}。`,
    `包含：${service.tiers.map((tier) => tier.includes.join("、")).join("；")}。`,
    service.highlights.length > 0 ? `亮点：${service.highlights.join("、")}。` : "",
    `沟通：${service.contact_hint}。`,
  ]);
}

function shortLead(service: ServiceInput, angle: Angle): string {
  const name = service.service;
  const place = service.city ? `${service.city}。` : "可远程。";
  switch (angle) {
    case "scope":
      return `${name}。${place}`;
    case "speed":
      return `${name}。按套餐工期。${place}`;
    case "local":
      return service.city ? `${name}。${service.city}本地。` : `${name}。可远程。`;
    case "price":
      return `${name}。按套餐标价。${place}`;
    case "revision":
      return `${name}。修改次数见套餐。${place}`;
    default:
      return assertNever(angle);
  }
}

function tierBullets(service: ServiceInput): string {
  return service.tiers
    .map((tier) => `- ${tier.name}：¥${formatPrice(tier.price)}（${tier.includes.join("、")}）`)
    .join("\n");
}

function highlightBlock(highlights: readonly string[]): string {
  if (highlights.length === 0) return "";
  return `亮点：\n${highlights.map((item) => `- ${item}`).join("\n")}`;
}

function joinBlocks(parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join("\n\n");
}
