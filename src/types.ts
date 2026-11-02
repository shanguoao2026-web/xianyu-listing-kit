export const TONES = ["pro", "casual", "short"] as const;
export type Tone = (typeof TONES)[number];
export type ToneChoice = Tone | "all";

export const ANGLES = ["scope", "speed", "local", "price", "revision"] as const;
export type Angle = (typeof ANGLES)[number];

export interface Tier {
  name: string;
  price: number;
  includes: string[];
}

export interface ServiceInput {
  title_seed: string;
  service: string;
  /** 空字符串表示未填写城市。 */
  city: string;
  tiers: Tier[];
  highlights: string[];
  contact_hint: string;
  banned_extra: string[];
  banned_allow: string[];
}

export interface Variant {
  index: number;
  tone: Tone;
  angle: Angle;
  title: string;
  body: string;
}

export interface GenerateResult {
  service: ServiceInput;
  requestedTone: ToneChoice;
  variants: Variant[];
  priceMarkdown: string;
  pricePlain: string;
  coverSvg: string;
}

export interface LintIssue {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
}

export interface OutputFile {
  path: string;
  content: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
