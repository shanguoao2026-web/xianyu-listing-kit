import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { UserError } from "./errors.js";
import { compileBanned, findBannedIssues, findPhoneIssues, type BannedRule } from "./match.js";
import { DEFAULT_LIMITS, TONE_KEYWORDS, TONE_LABEL, type Limits } from "./rules.js";
import type { LintIssue, Tone } from "./types.js";
import { isRecord } from "./types.js";
import { codePointLength, indexToLineCol } from "./text.js";

export interface LintDocumentOptions {
  banned: readonly BannedRule[];
  limits: Limits;
}

export interface LintPathOptions {
  extra?: readonly string[];
  allow?: readonly string[];
  filePhrases?: readonly string[];
  limits?: Partial<Limits>;
}

export interface LintReport {
  files: string[];
  issues: LintIssue[];
}

interface Marker {
  start: number;
  end: number;
  tone: Tone | null;
}

export function lintDocument(file: string, text: string, options: LintDocumentOptions): LintIssue[] {
  const issues: LintIssue[] = [];
  const markdown = lintMarkdownRecords(file, text, options.limits, issues);
  if (!markdown) lintTextRecords(file, text, options.limits, issues);
  issues.push(...findBannedIssues(file, text, options.banned));
  issues.push(...findPhoneIssues(file, text));
  return sortIssues(dedupe(issues));
}

export function lintPath(target: string, options: LintPathOptions = {}): LintReport {
  if (!existsSync(target)) throw new UserError(`找不到：${target}`);
  const manifest = loadManifestConfig(target);
  const limits = resolveLimits({ ...manifest.limits, ...options.limits });
  const banned = compileForPath(manifest, options);
  const rootIsDir = statSync(target).isDirectory();
  const files = listInputs(target);
  const issues: LintIssue[] = [];
  const labels: string[] = [];
  for (const file of files) {
    const info = statSync(file);
    if (info.size > 1_000_000) throw new UserError(`文件超过 1MB，不检查：${file}`);
    const text = readFileSync(file, "utf8");
    const label = rootIsDir ? relative(target, file).split(sep).join("/") : target;
    labels.push(label);
    issues.push(...lintDocument(label, text, { banned, limits }));
  }
  return { files: labels, issues: sortIssues(issues) };
}

export function formatIssue(issue: LintIssue): string {
  return `${issue.file}:${issue.line}:${issue.column}: error [${issue.rule}] ${issue.message}`;
}

export function resolveLimits(overrides: Partial<Limits> = {}): Limits {
  const next: Limits = { ...DEFAULT_LIMITS, ...overrides };
  if (
    !Number.isInteger(next.titleMin) ||
    !Number.isInteger(next.titleMax) ||
    next.titleMin < 1 ||
    next.titleMax < next.titleMin
  ) {
    throw new UserError(`标题长度范围无效：${next.titleMin} 到 ${next.titleMax}`);
  }
  if (!Number.isInteger(next.bodyMin) || !Number.isInteger(next.bodyMax) || !Number.isInteger(next.shortBodyMax)) {
    throw new UserError("正文长度范围无效");
  }
  if (
    next.bodyMin < 1 ||
    next.bodyMax < next.bodyMin ||
    next.shortBodyMax < next.bodyMin ||
    next.shortBodyMax > next.bodyMax
  ) {
    throw new UserError(
      `正文长度范围无效：最短 ${next.bodyMin}，最长 ${next.bodyMax}，短平快上限 ${next.shortBodyMax}`,
    );
  }
  return next;
}

function compileForPath(
  manifest: { extra: string[]; allow: string[] },
  options: LintPathOptions,
): BannedRule[] {
  return compileBanned(
    [...manifest.extra, ...(options.extra ?? [])],
    [...manifest.allow, ...(options.allow ?? [])],
    options.filePhrases ?? [],
  );
}

function lintMarkdownRecords(file: string, text: string, limits: Limits, issues: LintIssue[]): boolean {
  const markers = findMarkdownMarkers(text);
  return lintMarked(file, text, markers, "md", limits, issues);
}

function lintTextRecords(file: string, text: string, limits: Limits, issues: LintIssue[]): boolean {
  const markers = findTextMarkers(text);
  return lintMarked(file, text, markers, "txt", limits, issues);
}

function lintMarked(
  file: string,
  text: string,
  markers: Marker[],
  format: "md" | "txt",
  limits: Limits,
  issues: LintIssue[],
): boolean {
  const records = markers.filter((marker) => marker.tone !== null);
  if (records.length === 0) return false;
  for (const record of records) {
    const tone = record.tone;
    if (tone === null) continue;
    const index = markers.findIndex((marker) => marker.start === record.start && marker.end === record.end);
    const next = index >= 0 ? markers[index + 1] : undefined;
    const contentStart = record.end;
    const contentEnd = next ? next.start : text.length;
    const content = text.slice(contentStart, contentEnd);
    lintRecord(file, text, content, contentStart, tone, format, limits, issues);
  }
  return true;
}

function lintRecord(
  file: string,
  text: string,
  content: string,
  contentStart: number,
  tone: Tone,
  format: "md" | "txt",
  limits: Limits,
  issues: LintIssue[],
): void {
  const titleRe = format === "md" ? /^#\s+(.+?)\s*$/m : /^标题\s*[:：]\s*(.+?)\s*$/m;
  const titleMatch = titleRe.exec(content);
  if (!titleMatch) {
    const pos = indexToLineCol(text, contentStart);
    issues.push({
      file,
      line: pos.line,
      column: pos.column,
      rule: "missing-title",
      message: format === "md" ? "变体缺少 Markdown 一级标题" : "变体缺少「标题：」行",
    });
    return;
  }
  const title = (titleMatch[1] ?? "").trim();
  const titleAt = contentStart + (titleMatch.index ?? 0);
  const titlePos = indexToLineCol(text, titleAt);
  const titleLen = codePointLength(title);
  if (titleLen < limits.titleMin || titleLen > limits.titleMax) {
    issues.push({
      file,
      line: titlePos.line,
      column: titlePos.column,
      rule: "title-length",
      message: `标题长度为 ${titleLen}，应在 ${limits.titleMin} 到 ${limits.titleMax} 之间（闲鱼标题常见上限约 30 字）`,
    });
  }
  const after = (titleMatch.index ?? 0) + titleMatch[0].length;
  const body = content.slice(after).trim();
  const bodyRel = /\S/.exec(content.slice(after));
  const bodyAt =
    bodyRel && bodyRel.index !== undefined ? contentStart + after + bodyRel.index : titleAt;
  const bodyPos = indexToLineCol(text, bodyAt);
  const bodyLen = codePointLength(body);
  if (bodyLen < limits.bodyMin || bodyLen > limits.bodyMax) {
    issues.push({
      file,
      line: bodyPos.line,
      column: bodyPos.column,
      rule: "body-length",
      message: `正文长度为 ${bodyLen}，应在 ${limits.bodyMin} 到 ${limits.bodyMax} 之间`,
    });
  }
  if (tone === "short" && bodyLen > limits.shortBodyMax) {
    issues.push({
      file,
      line: bodyPos.line,
      column: bodyPos.column,
      rule: "short-body-length",
      message: `短平快正文长度为 ${bodyLen}，超过 ${limits.shortBodyMax}`,
    });
  }
  const keywords = TONE_KEYWORDS[tone];
  if (!keywords.some((keyword) => body.includes(keyword))) {
    issues.push({
      file,
      line: bodyPos.line,
      column: bodyPos.column,
      rule: "tone-keyword",
      message: `语气「${TONE_LABEL[tone]}」的正文需包含其一：${keywords.join("、")}`,
    });
  }
}

function findMarkdownMarkers(text: string): Marker[] {
  const markers: Marker[] = [];
  for (const match of text.matchAll(/<!--\s*xianyu-listing-kit\b([^>]*)-->/g)) {
    const attrs = parseAttrs(match[1] ?? "");
    const toneRaw = attrs.get("tone");
    const tone = toneRaw === "pro" || toneRaw === "casual" || toneRaw === "short" ? toneRaw : null;
    const start = match.index ?? 0;
    markers.push({ start, end: start + match[0].length, tone });
  }
  return markers;
}

function findTextMarkers(text: string): Marker[] {
  const markers: Marker[] = [];
  for (const match of text.matchAll(/^【变体\s+(\d+)\s*｜\s*(专业|口语|短平快)\s*】\s*$/gm)) {
    const label = match[2];
    const tone = label === "专业" ? "pro" : label === "口语" ? "casual" : label === "短平快" ? "short" : null;
    const start = match.index ?? 0;
    markers.push({ start, end: start + match[0].length, tone });
  }
  for (const match of text.matchAll(/^<!--\s*xianyu-listing-kit\s+end\s*-->\s*$/gm)) {
    const start = match.index ?? 0;
    markers.push({ start, end: start + match[0].length, tone: null });
  }
  markers.sort((a, b) => a.start - b.start);
  return markers;
}

function parseAttrs(source: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of source.matchAll(/([A-Za-z][\w-]*)=([^\s]+)/g)) {
    const key = match[1];
    const value = match[2];
    if (key !== undefined && value !== undefined) map.set(key, value);
  }
  return map;
}

interface ManifestConfig {
  extra: string[];
  allow: string[];
  limits: Partial<Limits>;
}

function loadManifestConfig(target: string): ManifestConfig {
  const empty: ManifestConfig = { extra: [], allow: [], limits: {} };
  const stat = statSync(target);
  const dirs = stat.isDirectory() ? [target] : [dirname(target), dirname(dirname(target))];
  for (const dir of dirs) {
    const path = join(dir, "manifest.json");
    if (!existsSync(path)) continue;
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch {
      continue;
    }
    if (!isRecord(data) || data.generator !== "xianyu-listing-kit") continue;
    return {
      extra: stringList(data.banned_extra, path, "banned_extra"),
      allow: stringList(data.banned_allow, path, "banned_allow"),
      limits: readLimits(data.limits, path),
    };
  }
  return empty;
}

function stringList(value: unknown, path: string, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new UserError(`${path}: ${field} 必须是字符串列表`);
  }
  return value;
}

function readLimits(value: unknown, path: string): Partial<Limits> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new UserError(`${path}: limits 必须是对象`);
  const out: Partial<Limits> = {};
  const keys: Array<keyof Limits> = ["titleMin", "titleMax", "bodyMin", "bodyMax", "shortBodyMax"];
  for (const key of keys) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== "number" || !Number.isInteger(value[key])) {
      throw new UserError(`${path}: limits.${key} 必须是整数`);
    }
    out[key] = value[key] as number;
  }
  return out;
}

const SKIP_DIR = new Set(["node_modules", ".git", "dist", "dist-test"]);

function listInputs(target: string): string[] {
  const stat = statSync(target);
  if (stat.isFile()) return [target];
  if (!stat.isDirectory()) throw new UserError(`不是文件或目录：${target}`);
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".") || SKIP_DIR.has(name)) continue;
      const abs = join(dir, name);
      const info = statSync(abs);
      if (info.isDirectory()) walk(abs);
      else if (info.isFile() && (name.endsWith(".md") || name.endsWith(".txt"))) out.push(abs);
    }
  };
  walk(target);
  out.sort((a, b) => a.localeCompare(b, "en"));
  return out;
}

function dedupe(issues: readonly LintIssue[]): LintIssue[] {
  const seen = new Set<string>();
  const out: LintIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.file}:${issue.line}:${issue.column}:${issue.rule}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

function sortIssues(issues: readonly LintIssue[]): LintIssue[] {
  return [...issues].sort(
    (a, b) =>
      a.file.localeCompare(b.file, "en") ||
      a.line - b.line ||
      a.column - b.column ||
      a.rule.localeCompare(b.rule, "en") ||
      a.message.localeCompare(b.message, "zh"),
  );
}
