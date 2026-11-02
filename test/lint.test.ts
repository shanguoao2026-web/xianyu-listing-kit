import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { generateListings } from "../src/generate.js";
import { loadServiceFile, loadServiceYaml } from "../src/load-service.js";
import { lintDocument, lintPath } from "../src/lint.js";
import { compileBanned } from "../src/match.js";
import { buildOutput, writeOutput } from "../src/output.js";
import { DEFAULT_LIMITS } from "../src/rules.js";
import { VERSION } from "../src/package-info.js";
import { projectRoot, removeTemp, tempDir } from "./helpers.js";

const root = projectRoot();
const limits = DEFAULT_LIMITS;

function issuesOf(text: string, filename = "hand.md") {
  return lintDocument(filename, text, { banned: compileBanned(), limits });
}

test("hand-written professional copy passes, and broken copy names the rule", () => {
  const clean = issuesOf(`<!-- xianyu-listing-kit tone=pro index=1 angle=scope -->
# 常州CAD出图服务

服务范围：按清单交付图纸，修改次数写在套餐里。沟通留在闲鱼。下单前说清格式和用途即可，未写明的内容不算在内。
`);
  assert.deepEqual(clean, []);

  const longTitle = issuesOf(`<!-- xianyu-listing-kit tone=pro index=1 angle=scope -->
# ${"标".repeat(31)}

服务范围：${"内容".repeat(30)}
`);
  assert.ok(longTitle.some((issue) => issue.rule === "title-length" && issue.line === 2));
  assert.equal(longTitle.some((issue) => issue.rule === "tone-keyword"), false);

  const shortTitle = issuesOf(`<!-- xianyu-listing-kit tone=pro index=1 angle=scope -->
# 短标题

服务范围：按清单交付图纸，修改次数写在套餐里。沟通留在闲鱼。下单前说清格式和用途即可。
`);
  assert.ok(shortTitle.some((issue) => issue.rule === "title-length"));

  const missing = issuesOf(`<!-- xianyu-listing-kit tone=pro index=1 angle=scope -->
没有标题只有正文，服务范围写在这里，再补一些字让它变长一点，足够过正文下限。
`);
  assert.ok(missing.some((issue) => issue.rule === "missing-title"));

  const casual = issuesOf(`<!-- xianyu-listing-kit tone=casual index=1 angle=scope -->
# 这是一个口语标题

这段正文故意不放语气锚点，只是把字数凑过四十，看看质检会不会指出缺少关键词。
`);
  assert.ok(casual.some((issue) => issue.rule === "tone-keyword" && issue.message.includes("随时聊")));

  const tooShort = issuesOf(`【变体 1｜短平快】
标题：短平快标题示例啊

价目：${"很长".repeat(260)}
`);
  assert.ok(tooShort.some((issue) => issue.rule === "short-body-length"));
  assert.equal(tooShort.some((issue) => issue.rule === "body-length"), false);
});

test("generated fixtures and their YAML pass lint", () => {
  const names = readdirSync(join(root, "fixtures")).filter((name) => name.endsWith(".yaml"));
  assert.ok(names.length >= 3);
  for (const name of names) {
    const yaml = readFileSync(join(root, "fixtures", name), "utf8");
    assert.deepEqual(issuesOf(yaml, name), []);
    const service = loadServiceFile(join(root, "fixtures", name));
    const result = generateListings(service, { variants: 5, tone: "all" });
    const files = buildOutput(result, { source: name, version: VERSION, limits });
    for (const file of files) {
      if (!file.path.endsWith(".md") && !file.path.endsWith(".txt")) continue;
      const found = lintDocument(file.path, file.content, {
        banned: compileBanned(service.banned_extra, service.banned_allow),
        limits,
      });
      assert.deepEqual(found, [], `${name} ${file.path} ${found.map((issue) => issue.message).join(";")}`);
    }
  }
});

test("directory lint reads banned_extra from manifest.json", () => {
  const dir = tempDir();
  try {
    const service = loadServiceYaml(`
title_seed: "常州CAD出图"
service: "机械零件 CAD 图纸"
city: "常州"
highlights: ["本地可面交确认"]
banned_extra: ["面交"]
tiers:
  - name: 基础
    price: 50
    includes: ["2D出图"]
`);
    const result = generateListings(service, { variants: 1, tone: "pro" });
    writeOutput(dir, buildOutput(result, { source: "mem.yaml", version: VERSION, limits }));
    const report = lintPath(dir);
    assert.ok(report.issues.some((issue) => issue.message.includes("面交") && issue.message.includes("自定义")));
    const allowed = loadServiceYaml(`
title_seed: "常州CAD出图"
service: "机械零件 CAD 图纸"
city: "常州"
highlights: ["本地可面交确认"]
banned_extra: ["面交"]
banned_allow: ["面交"]
tiers:
  - name: 基础
    price: 50
    includes: ["2D出图"]
`);
    writeOutput(dir, buildOutput(generateListings(allowed, { variants: 1, tone: "pro" }), {
      source: "mem.yaml",
      version: VERSION,
      limits,
    }));
    assert.deepEqual(lintPath(dir).issues, []);
  } finally {
    removeTemp(dir);
  }
});
