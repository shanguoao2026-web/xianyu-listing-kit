import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PALETTES, paletteIndex, renderCoverSvg } from "../src/cover.js";
import { loadServiceYaml, normalizeService } from "../src/load-service.js";
import { renderPriceTableMarkdown, renderPriceTablePlain } from "../src/price-table.js";
import { displayWidth } from "../src/text.js";
import { projectRoot } from "./helpers.js";

const cad = loadServiceYaml(readFileSync(join(projectRoot(), "fixtures/cad.yaml"), "utf8"));

test("markdown price table matches the documented CAD tiers", () => {
  assert.equal(
    renderPriceTableMarkdown(cad),
    ["| 套餐 | 价格 | 包含 |", "| --- | ---: | --- |", "| 基础 | ¥50 | 2D出图、1次修改 |", "| 加急 | ¥120 | 24h交付、3次修改 |"].join("\n"),
  );
});

test("plain price table aligns columns and keeps tier order", () => {
  const plain = renderPriceTablePlain(cad);
  const lines = plain.trimEnd().split("\n");
  assert.ok(lines.length >= 4);
  const widths = lines.map((line) => displayWidth(line));
  assert.equal(new Set(widths).size, 1);
  assert.ok(plain.includes("基础"));
  assert.ok(plain.includes("¥50"));
  assert.ok(plain.includes("¥120"));
  assert.ok(plain.includes("2D出图、1次修改"));
  assert.ok(plain.indexOf("基础") < plain.indexOf("加急"));
});

test("markdown cells escape pipes and format zero or decimal prices", () => {
  const piped = renderPriceTableMarkdown(
    normalizeService({
      title_seed: "管道测试",
      service: "管道服务",
      tiers: [{ name: "A|B", price: 10, includes: ["左|右"] }],
    }),
  );
  assert.ok(piped.includes("A\\|B"));
  assert.ok(piped.includes("左\\|右"));
  const free = renderPriceTableMarkdown(
    normalizeService({
      title_seed: "免费咨询呀",
      service: "问一句",
      tiers: [{ name: "咨询", price: 0, includes: ["15分钟"] }],
    }),
  );
  assert.ok(free.includes("| 咨询 | ¥0 | 15分钟 |"));
  const decimal = renderPriceTableMarkdown(
    normalizeService({
      title_seed: "小数价格",
      service: "问一句",
      tiers: [{ name: "小", price: 19.9, includes: ["一次"] }],
    }),
  );
  assert.ok(decimal.includes("| 小 | ¥19.9 | 一次 |"));
});

test("cover SVG is deterministic, escaped, and offline", () => {
  const svg = renderCoverSvg(cad);
  assert.equal(svg, renderCoverSvg(cad));
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>\n$/);
  assert.equal(svg.includes("<script"), false);
  assert.equal(svg.includes('href="http'), false);
  assert.equal(svg.includes("undefined"), false);
  assert.equal(svg.includes("NaN"), false);
  assert.ok(svg.includes("常州"));
  assert.ok(svg.includes("¥50"));
  assert.equal(svg.includes("¥120"), false);
  assert.ok(svg.includes("基础"));
  assert.ok(svg.includes(PALETTES[paletteIndex(cad.title_seed)]?.bg ?? "missing"));
  const opens = svg.match(/<text\b/g)?.length ?? 0;
  const closes = svg.match(/<\/text>/g)?.length ?? 0;
  assert.equal(opens, closes);
  assert.equal(svg.includes("&(?!"), false);
  assert.equal(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(svg), false);

  const hostile = renderCoverSvg(
    normalizeService({
      title_seed: `A&B<C>"D'`,
      service: "C<D",
      tiers: [{ name: "基础", price: 50, includes: ["一项"] }],
    }),
  );
  assert.equal(hostile.includes("A&B<"), false);
  assert.ok(hostile.includes("A&amp;B&lt;C&gt;&quot;D&apos;"));
  assert.ok(hostile.includes("C&lt;D"));
  assert.notEqual(hostile, svg);
});
