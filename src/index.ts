export { UserError } from "./errors.js";
export { generateListings, type GenerateOptions } from "./generate.js";
export { renderCoverSvg, paletteIndex, PALETTES } from "./cover.js";
export { loadServiceFile, loadServiceYaml, normalizeService } from "./load-service.js";
export { lintDocument, lintPath, formatIssue, resolveLimits, type LintReport } from "./lint.js";
export { compileBanned, findBannedIssues, findPhoneIssues, type BannedRule } from "./match.js";
export { buildOutput, writeOutput, type OutputMeta } from "./output.js";
export { renderPriceTableMarkdown, renderPriceTablePlain } from "./price-table.js";
export { DEFAULT_BANNED, CATEGORY_LABEL, type BannedCategory, type BannedEntry } from "./banned-words.js";
export { DEFAULT_LIMITS, TONE_KEYWORDS, TONE_LABEL, parseToneChoice, type Limits } from "./rules.js";
export { VERSION } from "./package-info.js";
export { main, HELP, type Io } from "./cli.js";
export {
  codePointLength,
  displayWidth,
  escapeXml,
  fitTitle,
  formatPrice,
  normalizeMatchText,
} from "./text.js";
export type {
  Angle,
  GenerateResult,
  LintIssue,
  OutputFile,
  ServiceInput,
  Tier,
  Tone,
  ToneChoice,
  Variant,
} from "./types.js";
