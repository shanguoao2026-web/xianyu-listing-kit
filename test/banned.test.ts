import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_BANNED } from "../src/banned-words.js";
import { lintDocument } from "../src/lint.js";
import { compileBanned } from "../src/match.js";
import { DEFAULT_LIMITS } from "../src/rules.js";
import { normalizeMatchText } from "../src/text.js";

function lint(text: string, extra: string[] = [], allow: string[] = []) {
  return lintDocument("sample.txt", text, {
    banned: compileBanned(extra, allow),
    limits: DEFAULT_LIMITS,
  });
}

test("default banned list is unique, specific, and large enough", () => {
  const norms = DEFAULT_BANNED.map((entry) => normalizeMatchText(entry.phrase).norm);
  assert.equal(new Set(norms).size, norms.length);
  for (const entry of DEFAULT_BANNED) {
    assert.ok([...entry.phrase].length >= 2, entry.phrase);
    assert.ok(entry.reason.trim().length >= 2);
  }
  assert.ok(DEFAULT_BANNED.length >= 60);
  for (const category of ["absolute", "finance", "medical", "offplatform"]) {
    assert.ok(DEFAULT_BANNED.some((entry) => entry.category === category));
  }
});

test("reports the longer phrase when a shorter one sits inside it", () => {
  const profit = lint("这里稳赚不赔呀");
  assert.equal(profit.length, 1);
  assert.match(profit[0]?.message ?? "", /「稳赚不赔」/);
  assert.equal((profit[0]?.message ?? "").includes("「稳赚」"), false);

  const cure = lint("包治百病不可信");
  assert.equal(cure.length, 1);
  assert.match(cure[0]?.message ?? "", /「包治百病」/);
});

test("matches fullwidth, dotted, and repeated banned phrases", () => {
  const wide = lint("请加ＶＸ");
  assert.equal(wide.length, 1);
  assert.match(wide[0]?.message ?? "", /「加vx」/);
  assert.match(wide[0]?.message ?? "", /引流站外/);

  const dotted = lint("加v.x");
  assert.equal(dotted.length, 1);
  assert.match(dotted[0]?.message ?? "", /「加vx」/);

  const twice = lint("加微信\n再加微信");
  assert.equal(twice.length, 2);
  assert.equal(twice[0]?.line, 1);
  assert.equal(twice[1]?.line, 2);

  const placed = lint("前缀加微信后缀");
  assert.equal(placed[0]?.line, 1);
  assert.equal(placed[0]?.column, 3);
});

test("allow list removes a phrase but not a longer sibling", () => {
  assert.equal(lint("请加微信", [], ["加微信"]).length, 0);
  const sibling = lint("请加我微信", [], ["加微信"]);
  assert.equal(sibling.length, 1);
  assert.match(sibling[0]?.message ?? "", /「加我微信」/);
});

test("custom extra phrases are labeled 自定义", () => {
  const issues = lint("可以面交", ["面交"]);
  assert.equal(issues.length, 1);
  assert.match(issues[0]?.message ?? "", /自定义/);
  assert.equal(lint("可以面交", ["面交"], ["面交"]).length, 0);
});

test("phone lint catches separators and fullwidth digits, not longer digit runs", () => {
  const text = "第一行\n联系 13800138000 谢谢";
  const issues = lint(text);
  const line = text.split("\n")[1] ?? "";
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.rule, "phone-number");
  assert.equal(issues[0]?.line, 2);
  assert.equal(issues[0]?.column, line.indexOf("13800138000") + 1);
  assert.match(issues[0]?.message ?? "", /13800138000/);

  assert.equal(lint("订单 138001380001 不是手机").length, 0);
  assert.equal(lint("价格 ¥50，24h交付").length, 0);
  assert.equal(lint("138-0013-8000").length, 1);
  assert.equal(lint("１３８００１３８０００").length, 1);
  assert.equal(lint("100%有效").filter((issue) => issue.rule === "banned-word").length, 1);
});
