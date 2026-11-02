import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { UserError } from "../src/errors.js";
import { generateListings } from "../src/generate.js";
import { loadServiceYaml } from "../src/load-service.js";
import { lintDocument } from "../src/lint.js";
import { compileBanned } from "../src/match.js";
import { buildOutput } from "../src/output.js";
import { DEFAULT_LIMITS, TONE_KEYWORDS } from "../src/rules.js";
import { codePointLength, formatPrice } from "../src/text.js";
import { projectRoot } from "./helpers.js";

const cad = loadServiceYaml(readFileSync(join(projectRoot(), "fixtures/cad.yaml"), "utf8"), "cad.yaml");
const video = loadServiceYaml(readFileSync(join(projectRoot(), "fixtures/short-video.yaml"), "utf8"));

test("default plan cycles tones and keeps CAD titles stable", () => {
  const result = generateListings(cad);
  assert.deepEqual(
    result.variants.map((variant) => variant.tone),
    ["pro", "casual", "short"],
  );
  assert.deepEqual(
    result.variants.map((variant) => variant.angle),
    ["scope", "speed", "local"],
  );
  assert.equal(result.variants[0]?.title, "常州CAD出图｜机械零件CAD图纸");
  assert.equal(result.variants[1]?.title, "常州CAD出图｜按套餐工期");
  assert.equal(result.variants[2]?.title, "常州CAD出图｜本地服务");
  assert.equal(result.requestedTone, "all");
});

test("same tone still rotates angles, and local or price suffixes follow the data", () => {
  const pros = generateListings(cad, { variants: 5, tone: "pro" });
  assert.deepEqual(
    pros.variants.map((variant) => variant.angle),
    ["scope", "speed", "local", "price", "revision"],
  );
  assert.equal(new Set(pros.variants.map((variant) => variant.title)).size, 5);
  assert.equal(pros.variants[3]?.title, "常州CAD出图｜¥50起");
  assert.equal(pros.variants[4]?.title, "常州CAD出图｜修改看套餐");
  assert.ok(pros.variants.every((variant) => variant.tone === "pro"));

  const priced = generateListings(video, { variants: 4, tone: "pro" });
  assert.equal(priced.variants[2]?.title, "短视频周包剪辑｜杭州本地");
  assert.equal(priced.variants[3]?.title, "短视频周包剪辑｜¥300起");
});

test("every variant repeats the YAML facts and stays inside title bounds", () => {
  const result = generateListings(cad, { variants: 5, tone: "all" });
  for (const variant of result.variants) {
    assert.ok(codePointLength(variant.title) >= 8 && codePointLength(variant.title) <= 30);
    assert.ok(variant.body.includes(cad.service));
    assert.ok(variant.body.includes(cad.city));
    assert.ok(variant.body.includes(cad.contact_hint));
    for (const tier of cad.tiers) {
      assert.ok(variant.body.includes(tier.name));
      assert.ok(variant.body.includes(formatPrice(tier.price)));
      for (const item of tier.includes) assert.ok(variant.body.includes(item), item);
    }
    for (const highlight of cad.highlights) assert.ok(variant.body.includes(highlight));
    const keywords = TONE_KEYWORDS[variant.tone];
    assert.ok(keywords.some((keyword) => variant.body.includes(keyword)));
  }
});

test("professional copy is longer than casual, which is longer than short", () => {
  const pro = generateListings(cad, { variants: 5, tone: "pro" });
  const casual = generateListings(cad, { variants: 5, tone: "casual" });
  const short = generateListings(cad, { variants: 5, tone: "short" });
  for (let index = 0; index < 5; index += 1) {
    const proBody = pro.variants[index]?.body ?? "";
    const casualBody = casual.variants[index]?.body ?? "";
    const shortBody = short.variants[index]?.body ?? "";
    assert.ok(codePointLength(shortBody) < codePointLength(casualBody), `short < casual @ ${index}`);
    assert.ok(codePointLength(casualBody) < codePointLength(proBody), `casual < pro @ ${index}`);
    assert.ok(codePointLength(shortBody) <= DEFAULT_LIMITS.shortBodyMax);
  }
});

test("minimal service omits the highlight block and still lints clean", () => {
  const minimal = {
    title_seed: "改表格",
    service: "Excel表格整理",
    city: "",
    tiers: [{ name: "一次", price: 30, includes: ["一个文件"] }],
    highlights: [],
    contact_hint: "闲鱼内联系",
    banned_extra: [],
    banned_allow: [],
  };
  const before = structuredClone(minimal);
  const result = generateListings(minimal, { variants: 5, tone: "all" });
  assert.deepEqual(minimal, before);
  for (const variant of result.variants) {
    assert.equal(variant.body.includes("亮点："), false);
    assert.ok(variant.body.includes("闲鱼内联系"));
    assert.ok(codePointLength(variant.body) >= DEFAULT_LIMITS.bodyMin);
    const issues = lintDocument("v.md", variant.body, {
      banned: compileBanned(),
      limits: DEFAULT_LIMITS,
    });
    assert.deepEqual(issues, []);
  }
  const pro = generateListings(minimal, { variants: 1, tone: "pro" }).variants[0]?.body ?? "";
  const casual = generateListings(minimal, { variants: 1, tone: "casual" }).variants[0]?.body ?? "";
  const short = generateListings(minimal, { variants: 1, tone: "short" }).variants[0]?.body ?? "";
  assert.ok(codePointLength(short) < codePointLength(casual));
  assert.ok(codePointLength(casual) < codePointLength(pro));
  assert.match(pro, /不限/);
});

test("generation is deterministic and does not use the higher tier as the lead price", () => {
  assert.deepEqual(generateListings(cad), generateListings(cad));
  const other = generateListings({ ...cad, title_seed: "苏州CAD出图" });
  assert.notEqual(other.variants[0]?.title, generateListings(cad).variants[0]?.title);
  const reversed = generateListings({
    title_seed: "补丁服务啊",
    service: "网站小修",
    city: "南京",
    tiers: [
      { name: "加急", price: 80, includes: ["当天看"] },
      { name: "普通", price: 20, includes: ["排队"] },
    ],
    highlights: ["先看需求"],
    contact_hint: "闲鱼聊",
    banned_extra: [],
    banned_allow: [],
  }, { variants: 4, tone: "pro" });
  assert.ok(reversed.priceMarkdown.indexOf("加急") < reversed.priceMarkdown.indexOf("普通"));
  assert.equal(reversed.variants[3]?.title, "补丁服务啊｜¥20起");
});

test("rejects variant counts outside 1 to 8", () => {
  assert.throws(() => generateListings(cad, { variants: 0 }), UserError);
  assert.throws(() => generateListings(cad, { variants: 9 }), UserError);
});

test("bundle files keep one record per variant and a separate price section", () => {
  const files = buildOutput(generateListings(cad), {
    source: "fixtures/cad.yaml",
    version: "0.1.0",
    limits: DEFAULT_LIMITS,
  });
  const paths = files.map((file) => file.path);
  assert.deepEqual(paths.sort(), [
    "cover.svg",
    "listing.md",
    "listing.txt",
    "manifest.json",
    "price-table.md",
    "price-table.txt",
    "variants/01-pro.md",
    "variants/01-pro.txt",
    "variants/02-casual.md",
    "variants/02-casual.txt",
    "variants/03-short.md",
    "variants/03-short.txt",
  ]);
  const listing = files.find((file) => file.path === "listing.md")?.content ?? "";
  assert.equal(listing.match(/<!-- xianyu-listing-kit tone=/g)?.length, 3);
  assert.ok(listing.includes("<!-- xianyu-listing-kit end -->"));
  assert.ok(listing.includes("| 基础 | ¥50 |"));
  const manifest = JSON.parse(files.find((file) => file.path === "manifest.json")?.content ?? "{}") as {
    engine?: string;
    source?: string;
    banned_extra?: string[];
  };
  assert.equal(manifest.engine, "template");
  assert.equal(manifest.source, "fixtures/cad.yaml");
  assert.deepEqual(manifest.banned_extra, []);
});
