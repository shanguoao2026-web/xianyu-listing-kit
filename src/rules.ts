import type { Tone, ToneChoice } from "./types.js";

/** 闲鱼标题栏常见可提交上限约 30 字；过短则缺少检索信息。按 Unicode 码位计数。 */
export interface Limits {
  titleMin: number;
  titleMax: number;
  bodyMin: number;
  bodyMax: number;
  shortBodyMax: number;
}

export const DEFAULT_LIMITS: Limits = {
  titleMin: 8,
  titleMax: 30,
  bodyMin: 40,
  bodyMax: 2000,
  shortBodyMax: 500,
};

export const TONE_LABEL: Record<Tone, string> = {
  pro: "专业",
  casual: "口语",
  short: "短平快",
};

/** 正文至少命中该语气下的一个锚点。生成器使用每组的第一个。 */
export const TONE_KEYWORDS: Record<Tone, readonly string[]> = {
  pro: ["服务范围", "交付标准"],
  casual: ["随时聊", "好沟通"],
  short: ["价目"],
};

export function parseToneChoice(raw: string): ToneChoice | null {
  switch (raw.trim().toLowerCase()) {
    case "all":
      return "all";
    case "pro":
      return "pro";
    case "casual":
      return "casual";
    case "short":
      return "short";
    default:
      break;
  }
  switch (raw.trim()) {
    case "专业":
      return "pro";
    case "口语":
      return "casual";
    case "短平快":
      return "short";
    default:
      return null;
  }
}
