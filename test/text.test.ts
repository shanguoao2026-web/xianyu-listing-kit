import assert from "node:assert/strict";
import { test } from "node:test";
import {
  codePointLength,
  displayWidth,
  escapeXml,
  fitTitle,
  formatPrice,
  indexToLineCol,
  normalizeMatchText,
  wrapCodePoints,
} from "../src/text.js";

test("formatPrice keeps cents without binary noise", () => {
  assert.equal(formatPrice(50), "50");
  assert.equal(formatPrice(0), "0");
  assert.equal(formatPrice(19.9), "19.9");
  assert.equal(formatPrice(19.99), "19.99");
  assert.equal(formatPrice(10.5), "10.5");
  assert.equal(formatPrice(0.1), "0.1");
});

test("fitTitle strips spaces and stays inside 8 to 30 code points", () => {
  assert.equal(fitTitle("常州 CAD 出图服务"), "常州CAD出图服务");
  assert.equal(fitTitle("常州 CAD"), "常州CAD｜服务说明");
  assert.equal(fitTitle("A"), "A｜服务说明服务");
  assert.equal(fitTitle("字".repeat(40)), "字".repeat(30));
  const cut = fitTitle(`${"字".repeat(29)}｜更多`);
  assert.equal(codePointLength(cut) <= 30, true);
  assert.equal(codePointLength(cut) >= 8, true);
  assert.equal(cut.endsWith("｜"), false);
  assert.equal(fitTitle(fitTitle("常州 CAD 出图服务")), "常州CAD出图服务");
});

test("display width treats CJK as 2 and ASCII as 1", () => {
  assert.equal(displayWidth("A中"), 3);
  assert.equal(displayWidth("汉字"), 4);
  assert.equal(displayWidth("¥50"), 3);
});

test("wrapCodePoints adds an ellipsis when text is cut", () => {
  assert.deepEqual(wrapCodePoints("一二三四五六七八九十甲", 5, 2), ["一二三四五", "六七八九…"]);
  assert.deepEqual(wrapCodePoints("短", 5, 2), ["短"]);
});

test("indexToLineCol is 1-based and escapeXml is single-pass", () => {
  assert.deepEqual(indexToLineCol("ab\ncd", 3), { line: 2, column: 1 });
  assert.equal(escapeXml(`A&B<C>"D'`), "A&amp;B&lt;C&gt;&quot;D&apos;");
});

test("normalizeMatchText folds width, case, and separators", () => {
  assert.equal(normalizeMatchText("加ＶＸ").norm, "加vx");
  assert.equal(normalizeMatchText("加v.x").norm, "加vx");
  assert.equal(normalizeMatchText("加 微信").norm, "加微信");
  assert.equal(normalizeMatchText("１００％有效").norm, "100%有效");
});
