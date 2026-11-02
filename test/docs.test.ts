import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { generateListings } from "../src/generate.js";
import { loadServiceFile } from "../src/load-service.js";
import { renderPriceTableMarkdown } from "../src/price-table.js";
import { VERSION } from "../src/package-info.js";
import { projectRoot } from "./helpers.js";

const root = projectRoot();

test("package version matches the changelog and the runtime constant", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version?: string; name?: string };
  assert.equal(pkg.name, "xianyu-listing-kit");
  assert.equal(pkg.version, "0.1.0");
  assert.equal(VERSION, pkg.version);
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /## \[0\.1\.0\] - 2026-11-02/);
  const license = readFileSync(join(root, "LICENSE"), "utf8");
  assert.match(license, /MIT License/);
});

test("README documents the real title, price table, rules, and offline boundary", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const cad = loadServiceFile(join(root, "fixtures/cad.yaml"));
  const result = generateListings(cad, { variants: 1, tone: "pro" });
  const title = result.variants[0]?.title ?? "";
  assert.ok(title.length > 0);
  assert.ok(readme.includes(title), title);
  assert.ok(readme.includes(renderPriceTableMarkdown(cad)));
  assert.match(readme, /Offline/);
  assert.match(readme, /Xianyu/);
  for (const id of [
    "banned-word",
    "phone-number",
    "title-length",
    "body-length",
    "short-body-length",
    "tone-keyword",
    "missing-title",
  ]) {
    assert.ok(readme.includes(id), id);
  }
  for (const phrase of ["服务范围", "交付标准", "随时聊", "好沟通", "价目", "加微信", "稳赚不赔", "包治百病", "套现"]) {
    assert.ok(readme.includes(phrase), phrase);
  }
  assert.ok(readme.includes("标题 8 到 30 个 Unicode 码位"));
  assert.ok(readme.includes("正文 40 到 2000"));
  assert.ok(readme.includes("短平快不超过 500"));
  assert.ok(readme.includes("fixtures/cad.yaml"));
  assert.ok(readme.includes("fixtures/short-video.yaml"));
  assert.ok(readme.includes("fixtures/n8n.yaml"));
});

test("source stays offline and deterministic", () => {
  for (const name of readdirSync(join(root, "src"))) {
    if (!name.endsWith(".ts")) continue;
    const text = readFileSync(join(root, "src", name), "utf8");
    assert.doesNotMatch(text, /\bfetch\s*\(/);
    assert.doesNotMatch(text, /node:http|node:https|node:net|axios|undici/);
    assert.doesNotMatch(text, /Math\.random|Date\.now|new Date\(/);
    assert.doesNotMatch(text, /\beval\s*\(|new Function\s*\(/);
  }
});
