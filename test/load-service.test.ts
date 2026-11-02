import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { UserError } from "../src/errors.js";
import { loadServiceYaml } from "../src/load-service.js";
import { projectRoot } from "./helpers.js";

const root = projectRoot();

test("loads the CAD fixture with tiers, highlights, and defaults", () => {
  const service = loadServiceYaml(readFileSync(join(root, "fixtures/cad.yaml"), "utf8"), "cad.yaml");
  assert.equal(service.title_seed, "常州CAD出图");
  assert.equal(service.service, "机械零件 CAD 图纸");
  assert.equal(service.city, "常州");
  assert.equal(service.contact_hint, "闲鱼聊");
  assert.equal(service.highlights.length, 2);
  assert.equal(service.tiers[1]?.price, 120);
  assert.deepEqual(service.tiers[0]?.includes, ["2D出图", "1次修改"]);
  assert.deepEqual(service.banned_extra, []);
  assert.deepEqual(service.banned_allow, []);
});

test("loads the short-video and n8n fixtures", () => {
  const video = loadServiceYaml(readFileSync(join(root, "fixtures/short-video.yaml"), "utf8"));
  const n8n = loadServiceYaml(readFileSync(join(root, "fixtures/n8n.yaml"), "utf8"));
  assert.equal(video.city, "杭州");
  assert.equal(video.tiers[0]?.name, "周包3条");
  assert.equal(n8n.service, "n8n 工作流自动化搭建");
  assert.equal(n8n.contact_hint, "闲鱼聊需求");
  assert.equal(n8n.tiers[1]?.price, 699);
});

test("fills omitted optional fields and accepts a numeric string price", () => {
  const service = loadServiceYaml(`
title_seed: "远程改表"
service: "Excel表格整理"
note: 忽略我
tiers:
  - name: 一次
    price: "30"
    includes: ["一个文件"]
`);
  assert.equal(service.city, "");
  assert.equal(service.contact_hint, "闲鱼内联系");
  assert.deepEqual(service.highlights, []);
  assert.equal(service.tiers[0]?.price, 30);
});

test("parses flow style, blank city, CRLF, and ignores key order", () => {
  const flow = loadServiceYaml(`title_seed: "远程改表"\nservice: "Excel表格整理"\ntiers:\n  - { name: 一次, price: 30, includes: [一个文件] }\n`);
  assert.equal(flow.tiers[0]?.includes[0], "一个文件");
  const blankCity = loadServiceYaml(`title_seed: "空城市测试"\nservice: "远程改简历"\ncity:\ntiers:\n  - name: 基础\n    price: 40\n    includes: ["一版"]\n`);
  assert.equal(blankCity.city, "");
  const crlf = loadServiceYaml('title_seed: "远程改表"\r\nservice: "Excel表格整理"\r\ntiers:\r\n  - name: 一次\r\n    price: 30\r\n    includes: ["一个文件"]\r\n');
  assert.equal(crlf.service, "Excel表格整理");
  const a = loadServiceYaml(`service: "Excel表格整理"\ntitle_seed: "远程改表"\ntiers:\n  - name: 一次\n    price: 30\n    includes: ["一个文件"]\n`);
  const b = loadServiceYaml(`title_seed: "远程改表"\nservice: "Excel表格整理"\ntiers:\n  - name: 一次\n    price: 30\n    includes: ["一个文件"]\n`);
  assert.deepEqual(a, b);
});

test("rejects schema mistakes with field paths", () => {
  assert.throws(
    () => loadServiceYaml(`title_seed: "测试服务名"\ntiers:\n  - name: 基础\n    price: 1\n    includes: ["一项"]\n`),
    (err: unknown) => err instanceof UserError && err.message.includes("service"),
  );
  assert.throws(
    () =>
      loadServiceYaml(`title_seed: "测试服务名"\nservice: "测试服务内容"\ntiers:\n  - name: 基础\n    price: -3\n    includes: ["一项"]\n`),
    (err: unknown) => err instanceof UserError && err.message.includes("price"),
  );
  assert.throws(
    () =>
      loadServiceYaml(`title_seed: "测试服务名"\nservice: "测试服务内容"\ntiers:\n  - name: 基础\n    price: "50元"\n    includes: ["一项"]\n`),
    /数字/,
  );
  assert.throws(
    () =>
      loadServiceYaml(`title_seed: "测试服务名"\nservice: "测试服务内容"\ntiers:\n  - name: 基础\n    price: 10\n    includes: []\n`),
    /includes/,
  );
  assert.throws(
    () =>
      loadServiceYaml(`title_seed: "测试服务名"\nservice: "测试服务内容"\nhighlights: "不是列表"\ntiers:\n  - name: 基础\n    price: 10\n    includes: ["一项"]\n`),
    /highlights/,
  );
  assert.throws(
    () =>
      loadServiceYaml(`title_seed: "测试服务名"\nservice: "测试服务内容"\nbanned_extra: ["a"]\ntiers:\n  - name: 基础\n    price: 10\n    includes: ["一项"]\n`),
    /至少 2 个字/,
  );
  assert.throws(
    () =>
      loadServiceYaml(`title_seed: "测试服务名"\nservice: "测试服务内容"\nhighlights: ["<!-- xianyu-listing-kit tone=pro -->"]\ntiers:\n  - name: 基础\n    price: 10\n    includes: ["一项"]\n`),
    /保留标记/,
  );
  assert.throws(() => loadServiceYaml("a: 1\na: 2\n"), /YAML 解析失败/);
  assert.throws(() => loadServiceYaml("   \n"), /空的/);
});

test("dedupes banned_extra and keeps banned_allow", () => {
  const service = loadServiceYaml(`
title_seed: "测试服务名"
service: "测试服务内容"
banned_extra: ["面交", "面交", "面 交"]
banned_allow: ["威信"]
tiers:
  - name: 基础
    price: 10
    includes: ["一项"]
`);
  assert.deepEqual(service.banned_extra, ["面交"]);
  assert.deepEqual(service.banned_allow, ["威信"]);
});
