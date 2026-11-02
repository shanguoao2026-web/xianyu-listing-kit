import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgv } from "./argv.js";
import { UserError } from "./errors.js";
import { generateListings } from "./generate.js";
import { loadServiceFile } from "./load-service.js";
import { formatIssue, lintPath } from "./lint.js";
import { buildOutput, writeOutput } from "./output.js";
import { readPackageInfo, VERSION } from "./package-info.js";
import { DEFAULT_LIMITS, TONE_LABEL, parseToneChoice, type Limits } from "./rules.js";
import { codePointLength } from "./text.js";

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
  cwd: string;
}

export const HELP = `xianyu-listing-kit — 离线生成闲鱼服务文案、封面和价目表

用法
  xianyu-listing-kit generate --in <service.yaml> --out <目录> [--variants 3] [--tone all|pro|casual|short]
  xianyu-listing-kit lint --in <目录或文件> [--banned <词表>] [--extra 词1,词2] [--allow 词1,词2]
  xianyu-listing-kit init-sample [--out service.yaml] [--force]
  xianyu-listing-kit --help
  xianyu-listing-kit --version

说明
  只根据 YAML 里的事实套模板，同一份输入得到同一批文件。
  不登录闲鱼，不自动发布，不访问网络。
  --llm 已留出入口但未启用，传入会直接失败。

语气
  all      专业、口语、短平快轮换（默认）
  pro      专业，也可写 专业
  casual   口语，也可写 口语
  short    短平快，也可写 短平快
  --variants 取 1 到 8，默认 3

质检长度
  可用 --title-min --title-max --body-min --body-max --short-body-max 覆盖默认值。

退出码
  0  成功，或质检未发现问题
  1  质检发现问题
  2  用法或输入错误
`;

export function defaultIo(): Io {
  return {
    cwd: process.cwd(),
    stdout(text: string) {
      process.stdout.write(text);
    },
    stderr(text: string) {
      process.stderr.write(text);
    },
  };
}

export function main(argv: readonly string[], io: Io = defaultIo()): number {
  try {
    return dispatch(argv, io);
  } catch (err) {
    if (err instanceof UserError) {
      io.stderr(err.message.endsWith("\n") ? err.message : `${err.message}\n`);
      return err.exitCode;
    }
    const message = err instanceof Error ? err.message : String(err);
    io.stderr(`内部错误：${message}\n`);
    return 2;
  }
}

function dispatch(argv: readonly string[], io: Io): number {
  const parsed = parseArgv(argv);
  if (parsed.help || parsed.command === "help") {
    io.stdout(HELP.endsWith("\n") ? HELP : `${HELP}\n`);
    return 0;
  }
  if (parsed.llm) {
    io.stderr("--llm 未启用。这个版本只按模板离线生成，不会访问网络，也不会调用模型。请去掉 --llm。\n");
    return 2;
  }
  if (parsed.version) {
    io.stdout(`xianyu-listing-kit ${VERSION}\n`);
    return 0;
  }
  if (parsed.command === null) {
    io.stdout(HELP.endsWith("\n") ? HELP : `${HELP}\n`);
    return 0;
  }
  switch (parsed.command) {
    case "generate":
      rejectUnknown(parsed.flags, ["in", "out", "variants", "tone"]);
      return commandGenerate(parsed.flags, io);
    case "lint":
      rejectUnknown(parsed.flags, [
        "in",
        "banned",
        "extra",
        "allow",
        "title-min",
        "title-max",
        "body-min",
        "body-max",
        "short-body-max",
      ]);
      return commandLint(parsed.flags, io);
    case "init-sample":
      rejectUnknown(parsed.flags, ["out"]);
      return commandInit(parsed.flags, parsed.force, io);
    default:
      throw new UserError(`未知命令 ${parsed.command}。运行 xianyu-listing-kit --help 查看用法。`);
  }
}

function commandGenerate(flags: Record<string, string>, io: Io): number {
  const inRaw = required(flags, "in");
  const outRaw = required(flags, "out");
  const inPath = resolve(io.cwd, inRaw);
  const outPath = resolve(io.cwd, outRaw);
  if (existsSync(outPath) && !statSync(outPath).isDirectory()) {
    throw new UserError(`输出路径是文件，请换一个目录：${outRaw}`);
  }
  const variants = flags.variants === undefined ? 3 : parseVariants(flags.variants);
  const toneRaw = flags.tone ?? "all";
  const tone = parseToneChoice(toneRaw);
  if (tone === null) throw new UserError("--tone 只能是 all、pro、casual、short，或 专业、口语、短平快");
  const service = loadServiceFile(inPath);
  const result = generateListings(service, { variants, tone });
  const files = buildOutput(result, { source: inRaw, version: VERSION, limits: DEFAULT_LIMITS });
  writeOutput(outPath, files);
  const lines = [`已生成 ${result.variants.length} 条文案 → ${outRaw}`];
  for (const variant of result.variants) {
    lines.push(`  ${variant.index}. [${TONE_LABEL[variant.tone]}] ${variant.title}`);
  }
  lines.push(`封面 ${outRaw}/cover.svg`);
  lines.push(`价目 ${outRaw}/price-table.md`);
  lines.push(`质检 xianyu-listing-kit lint --in ${outRaw}`);
  io.stdout(`${lines.join("\n")}\n`);
  return 0;
}

function commandLint(flags: Record<string, string>, io: Io): number {
  const inRaw = required(flags, "in");
  const target = resolve(io.cwd, inRaw);
  const filePhrases = flags.banned === undefined ? [] : loadBannedFile(resolve(io.cwd, flags.banned));
  const extra = splitCsv(flags.extra);
  const allow = splitCsv(flags.allow);
  for (const phrase of [...extra, ...allow, ...filePhrases]) {
    if (codePointLength(phrase) < 2) throw new UserError(`词过短（至少 2 个字）：${phrase}`);
  }
  const report = lintPath(target, {
    extra,
    allow,
    filePhrases,
    limits: limitFlags(flags),
  });
  if (report.files.length === 0) {
    io.stderr(`没有可检查的文本文件：${inRaw}\n`);
    return 2;
  }
  if (report.issues.length === 0) {
    io.stdout(`未发现问题（${report.files.length} 个文件）\n`);
    return 0;
  }
  for (const issue of report.issues) io.stdout(`${formatIssue(issue)}\n`);
  io.stdout(`发现 ${report.issues.length} 个问题\n`);
  return 1;
}

function commandInit(flags: Record<string, string>, force: boolean, io: Io): number {
  const rel = flags.out ?? "service.yaml";
  const target = resolve(io.cwd, rel);
  if (existsSync(target) && statSync(target).isDirectory()) {
    throw new UserError(`请指定文件路径，而不是目录：${rel}`);
  }
  if (existsSync(target) && !force) throw new UserError(`已存在 ${rel}，如要覆盖请加 --force`);
  const samplePath = join(readPackageInfo().root, "fixtures", "cad.yaml");
  const text = readFileSync(samplePath, "utf8");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  io.stdout(`已写入示例 ${rel}\n下一步：xianyu-listing-kit generate --in ${rel} --out ./out\n`);
  return 0;
}

function loadBannedFile(path: string): string[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    const code = err instanceof Error && "code" in err ? String((err as { code?: unknown }).code) : "";
    if (code === "ENOENT") throw new UserError(`找不到禁用词表：${path}`);
    throw new UserError(`无法读取禁用词表：${path}`);
  }
  const phrases: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? "").trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const phrase = trimmed.replace(/\s+#.*$/, "").trim();
    if (phrase === "") continue;
    if (codePointLength(phrase) < 2 || codePointLength(phrase) > 40) {
      throw new UserError(`${path}:${index + 1}: 禁用词需要 2 到 40 个字`);
    }
    phrases.push(phrase);
  }
  return phrases;
}

function limitFlags(flags: Record<string, string>): Partial<Limits> {
  const map: Array<[keyof Limits, string]> = [
    ["titleMin", "title-min"],
    ["titleMax", "title-max"],
    ["bodyMin", "body-min"],
    ["bodyMax", "body-max"],
    ["shortBodyMax", "short-body-max"],
  ];
  const out: Partial<Limits> = {};
  for (const [key, flag] of map) {
    const raw = flags[flag];
    if (raw === undefined) continue;
    if (!/^\d+$/.test(raw)) throw new UserError(`--${flag} 需要非负整数`);
    out[key] = Number(raw);
  }
  return out;
}

function parseVariants(raw: string): number {
  if (!/^\d+$/.test(raw)) throw new UserError(`--variants 需要 1 到 8 的整数，收到「${raw}」`);
  const value = Number(raw);
  if (value < 1 || value > 8) throw new UserError(`--variants 需要 1 到 8 的整数，收到「${raw}」`);
  return value;
}

function splitCsv(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function required(flags: Record<string, string>, key: string): string {
  const value = flags[key];
  if (value === undefined || value.trim() === "") throw new UserError(`缺少 --${key}`);
  return value;
}

function rejectUnknown(flags: Record<string, string>, allowed: readonly string[]): void {
  for (const key of Object.keys(flags)) {
    if (!allowed.includes(key)) throw new UserError(`此命令不支持 --${key}`);
  }
}
