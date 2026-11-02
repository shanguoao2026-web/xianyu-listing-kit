import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { UserError } from "./errors.js";
import type { GenerateResult, OutputFile, Variant } from "./types.js";
import type { Limits } from "./rules.js";
import { TONE_LABEL } from "./rules.js";

export interface OutputMeta {
  source: string;
  version: string;
  limits: Limits;
}

const VARIANT_FILE = /^\d{2}-(?:pro|casual|short)\.(?:md|txt)$/;

export function buildOutput(result: GenerateResult, meta: OutputMeta): OutputFile[] {
  const files: OutputFile[] = [];
  const variantMeta: Array<{
    index: number;
    tone: Variant["tone"];
    angle: Variant["angle"];
    title: string;
    md: string;
    txt: string;
  }> = [];
  for (const variant of result.variants) {
    const stem = `${String(variant.index).padStart(2, "0")}-${variant.tone}`;
    const md = `variants/${stem}.md`;
    const txt = `variants/${stem}.txt`;
    files.push({ path: md, content: renderVariantMd(variant) });
    files.push({ path: txt, content: renderVariantTxt(variant) });
    variantMeta.push({
      index: variant.index,
      tone: variant.tone,
      angle: variant.angle,
      title: variant.title,
      md,
      txt,
    });
  }
  files.push({ path: "listing.md", content: renderBundleMd(result) });
  files.push({ path: "listing.txt", content: renderBundleTxt(result) });
  files.push({ path: "price-table.md", content: withNl(`# 套餐价目\n\n${result.priceMarkdown}`) });
  files.push({ path: "price-table.txt", content: withNl(result.pricePlain.trimEnd()) });
  files.push({ path: "cover.svg", content: withNl(result.coverSvg.trimEnd()) });
  const manifest = {
    generator: "xianyu-listing-kit",
    version: meta.version,
    engine: "template",
    source: meta.source,
    requestedTone: result.requestedTone,
    limits: meta.limits,
    banned_extra: result.service.banned_extra,
    banned_allow: result.service.banned_allow,
    cover: "cover.svg",
    priceTable: { markdown: "price-table.md", plain: "price-table.txt" },
    listing: { markdown: "listing.md", plain: "listing.txt" },
    variants: variantMeta,
  };
  files.push({ path: "manifest.json", content: `${JSON.stringify(manifest, null, 2)}\n` });
  return files;
}

export function writeOutput(dir: string, files: readonly OutputFile[]): void {
  for (const file of files) {
    if (file.path.startsWith("/") || file.path.includes("..") || file.path.includes("\\")) {
      throw new Error(`内部错误：非法输出路径 ${file.path}`);
    }
  }
  mkdirSync(dir, { recursive: true });
  if (!statSync(dir).isDirectory()) throw new UserError(`输出路径是文件，请换一个目录：${dir}`);
  const variantsDir = join(dir, "variants");
  mkdirSync(variantsDir, { recursive: true });
  const keep = new Set(
    files.filter((file) => file.path.startsWith("variants/")).map((file) => file.path.slice("variants/".length)),
  );
  for (const name of readdirSync(variantsDir)) {
    if (VARIANT_FILE.test(name) && !keep.has(name)) unlinkSync(join(variantsDir, name));
  }
  for (const file of files) {
    const abs = join(dir, file.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, file.content, "utf8");
  }
}

function renderVariantMd(variant: Variant): string {
  return withNl(
    `<!-- xianyu-listing-kit tone=${variant.tone} index=${variant.index} angle=${variant.angle} -->\n# ${variant.title}\n\n${variant.body.trim()}`,
  );
}

function renderVariantTxt(variant: Variant): string {
  const label = TONE_LABEL[variant.tone];
  return withNl(`【变体 ${variant.index}｜${label}】\n标题：${variant.title}\n\n${variant.body.trim()}`);
}

function renderBundleMd(result: GenerateResult): string {
  const parts = [
    "<!-- xianyu-listing-kit bundle -->",
    `# ${result.service.title_seed}`,
    "",
    "以下文案由 xianyu-listing-kit 离线模板生成，只复述输入里的事实。发布前请自行核对。",
    "",
  ];
  for (const variant of result.variants) {
    parts.push(renderVariantMd(variant).trimEnd(), "");
  }
  parts.push("<!-- xianyu-listing-kit end -->", "", "# 套餐价目", "", result.priceMarkdown, "");
  return withNl(parts.join("\n"));
}

function renderBundleTxt(result: GenerateResult): string {
  const parts = [
    result.service.title_seed,
    "",
    "以下文案由 xianyu-listing-kit 离线模板生成，只复述输入里的事实。发布前请自行核对。",
    "",
  ];
  for (const variant of result.variants) {
    parts.push(renderVariantTxt(variant).trimEnd(), "");
  }
  parts.push("<!-- xianyu-listing-kit end -->", "", "【价目表】", "", result.pricePlain.trimEnd(), "");
  return withNl(parts.join("\n"));
}

function withNl(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
