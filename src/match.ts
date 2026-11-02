import { CATEGORY_LABEL, DEFAULT_BANNED, type BannedCategory, type BannedEntry } from "./banned-words.js";
import type { LintIssue } from "./types.js";
import { indexToLineCol, normalizeMatchText } from "./text.js";

export interface BannedRule {
  phrase: string;
  category: BannedCategory | "custom";
  reason: string;
}

export function compileBanned(
  extra: readonly string[] = [],
  allow: readonly string[] = [],
  more: readonly string[] = [],
): BannedRule[] {
  const allowKeys = new Set(allow.map((phrase) => normalizeMatchText(phrase).norm));
  const seen = new Set<string>();
  const rules: BannedRule[] = [];
  const push = (rule: BannedRule): void => {
    const key = normalizeMatchText(rule.phrase).norm;
    if (key.length < 2 || seen.has(key) || allowKeys.has(key)) return;
    seen.add(key);
    rules.push(rule);
  };
  for (const entry of DEFAULT_BANNED) push(entry);
  for (const phrase of extra) push({ phrase, category: "custom", reason: "服务描述追加" });
  for (const phrase of more) push({ phrase, category: "custom", reason: "外部词表" });
  return rules;
}

interface Hit {
  normStart: number;
  normEnd: number;
  rule: BannedRule;
}

export function findBannedIssues(file: string, text: string, rules: readonly BannedRule[]): LintIssue[] {
  if (rules.length === 0 || text.length === 0) return [];
  const { norm, map } = normalizeMatchText(text);
  const hits: Hit[] = [];
  for (const rule of rules) {
    const needle = normalizeMatchText(rule.phrase).norm;
    if (needle.length < 2) continue;
    let from = 0;
    while (from <= norm.length - needle.length) {
      const at = norm.indexOf(needle, from);
      if (at < 0) break;
      hits.push({ normStart: at, normEnd: at + needle.length, rule });
      from = at + needle.length;
    }
  }
  hits.sort((a, b) => b.normEnd - b.normStart - (a.normEnd - a.normStart) || a.normStart - b.normStart);
  const kept: Hit[] = [];
  for (const hit of hits) {
    const inside = kept.some(
      (other) =>
        hit.normStart >= other.normStart &&
        hit.normEnd <= other.normEnd &&
        (hit.normStart !== other.normStart || hit.normEnd !== other.normEnd),
    );
    if (!inside) kept.push(hit);
  }
  return kept.map((hit) => {
    const origin = map[hit.normStart] ?? 0;
    const pos = indexToLineCol(text, origin);
    return {
      file,
      line: pos.line,
      column: pos.column,
      rule: "banned-word",
      message: `禁用词「${hit.rule.phrase}」（${CATEGORY_LABEL[hit.rule.category]}：${hit.rule.reason}）`,
    };
  });
}

const PHONE = /(?<!\d)1[3-9]\d{9}(?!\d)/g;

export function findPhoneIssues(file: string, text: string): LintIssue[] {
  const { norm, map } = normalizeMatchText(text);
  const issues: LintIssue[] = [];
  for (const match of norm.matchAll(PHONE)) {
    const at = match.index;
    if (at === undefined) continue;
    const origin = map[at];
    if (origin === undefined) continue;
    const pos = indexToLineCol(text, origin);
    issues.push({
      file,
      line: pos.line,
      column: pos.column,
      rule: "phone-number",
      message: `疑似手机号「${match[0]}」（引流站外：请放在平台聊天里，不要写进文案）`,
    });
  }
  return issues;
}

export function bannedEntryCount(): number {
  return DEFAULT_BANNED.length;
}

export type { BannedEntry };
