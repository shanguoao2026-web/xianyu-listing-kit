import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { captureIo, projectRoot, removeTemp, tempDir } from "./helpers.js";

const root = projectRoot();

test("help and version work without touching the filesystem", () => {
  const help = captureIo(root);
  assert.equal(main([], help.io), 0);
  assert.match(help.text().out, /generate/);
  assert.match(help.text().out, /init-sample/);
  assert.match(help.text().out, /--tone/);
  assert.match(help.text().out, /--llm/);

  const version = captureIo(root);
  assert.equal(main(["--version"], version.io), 0);
  assert.match(version.text().out, /xianyu-listing-kit 0\.1\.0/);
  assert.equal(main(["generate", "--version"], captureIo(root).io), 0);

  const unknown = captureIo(root);
  assert.equal(main(["nope"], unknown.io), 2);
  assert.match(unknown.text().err, /未知命令/);

  const missing = captureIo(root);
  assert.equal(main(["generate", "--in", "fixtures/cad.yaml"], missing.io), 2);
  assert.match(missing.text().err, /缺少 --out/);

  const llm = captureIo(root);
  assert.equal(main(["generate", "--llm", "--in", "fixtures/cad.yaml", "--out", "out"], llm.io), 2);
  assert.match(llm.text().err, /未启用/);
  assert.match(llm.text().err, /不会访问网络/);
});

test("generate then lint is clean, and a second run drops stale variants", () => {
  const dir = tempDir();
  const io = captureIo(root);
  try {
    assert.equal(main(["generate", "--in", "fixtures/cad.yaml", "--out", dir, "--variants", "3"], io.io), 0);
    assert.match(io.text().out, /已生成 3 条文案/);
    assert.match(io.text().out, /常州CAD出图｜机械零件CAD图纸/);
    assert.equal(readFileSync(join(dir, "cover.svg"), "utf8").startsWith("<svg"), true);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { source?: string };
    assert.equal(manifest.source, "fixtures/cad.yaml");

    const lint = captureIo(root);
    assert.equal(main(["lint", "--in", dir], lint.io), 0);
    assert.match(lint.text().out, /未发现问题/);

    const again = tempDir();
    try {
      assert.equal(main(["generate", "--in", "fixtures/cad.yaml", "--out", again], captureIo(root).io), 0);
      assert.equal(readFileSync(join(dir, "cover.svg"), "utf8"), readFileSync(join(again, "cover.svg"), "utf8"));
    } finally {
      removeTemp(again);
    }

    writeFileSync(join(dir, "keep.txt"), "hello\n");
    mkdirSync(join(dir, "variants"), { recursive: true });
    writeFileSync(join(dir, "variants", "notes.txt"), "keep\n");
    assert.equal(main(["generate", "--in", "fixtures/cad.yaml", "--out", dir, "--variants", "1", "--tone", "专业"], captureIo(root).io), 0);
    const names = readdirSync(join(dir, "variants")).sort();
    assert.deepEqual(names, ["01-pro.md", "01-pro.txt", "notes.txt"]);
    assert.equal(readFileSync(join(dir, "keep.txt"), "utf8"), "hello\n");
    const proOnly = captureIo(root);
    assert.match(readFileSync(join(dir, "listing.txt"), "utf8"), /【变体 1｜专业】/);
    assert.equal(main(["lint", "--in", dir, "--title-max", "10"], proOnly.io), 1);
    assert.match(proOnly.text().out, /title-length/);
  } finally {
    removeTemp(dir);
  }
});

test("init-sample writes the CAD fixture and refuses to overwrite", () => {
  const dir = tempDir();
  try {
    const target = join(dir, "nested", "service.yaml");
    const io = captureIo(dir);
    assert.equal(main(["init-sample", "--out", target], io.io), 0);
    assert.equal(readFileSync(target, "utf8"), readFileSync(join(root, "fixtures/cad.yaml"), "utf8"));
    const again = captureIo(dir);
    assert.equal(main(["init-sample", "--out", target], again.io), 2);
    assert.match(again.text().err, /已存在/);
    assert.equal(main(["init-sample", "--out", target, "--force"], captureIo(dir).io), 0);
  } finally {
    removeTemp(dir);
  }
});

test("lint exits 1 for banned words and phone numbers supplied by the user", () => {
  const dir = tempDir();
  try {
    const yamlPath = join(dir, "bad.yaml");
    writeFileSync(
      yamlPath,
      `title_seed: "常州CAD出图"\nservice: "机械零件 CAD 图纸"\ncity: "常州"\nhighlights: ["加微信详谈"]\ncontact_hint: "闲鱼聊"\ntiers:\n  - name: 基础\n    price: 50\n    includes: ["2D出图"]\n`,
    );
    const out = join(dir, "out");
    assert.equal(main(["generate", "--in", yamlPath, "--out", out, "--variants", "1"], captureIo(dir).io), 0);
    const lint = captureIo(dir);
    assert.equal(main(["lint", "--in", out], lint.io), 1);
    assert.match(lint.text().out, /加微信/);
    assert.match(lint.text().out, /引流站外/);
    assert.match(lint.text().out, /发现/);

    const phoneYaml = join(dir, "phone.yaml");
    writeFileSync(
      phoneYaml,
      `title_seed: "常州CAD出图"\nservice: "机械零件 CAD 图纸"\ncontact_hint: "13800138000"\ntiers:\n  - name: 基础\n    price: 50\n    includes: ["2D出图"]\n`,
    );
    const phoneOut = join(dir, "phone-out");
    assert.equal(main(["generate", "--in", phoneYaml, "--out", phoneOut, "--variants", "1"], captureIo(dir).io), 0);
    const phoneLint = captureIo(dir);
    assert.equal(main(["lint", "--in", phoneOut], phoneLint.io), 1);
    assert.match(phoneLint.text().out, /phone-number/);
  } finally {
    removeTemp(dir);
  }
});

test("external banned file and unsupported flags are handled", () => {
  const dir = tempDir();
  try {
    const out = join(dir, "out");
    assert.equal(main(["generate", "--in", join(root, "fixtures/cad.yaml"), "--out", out], captureIo(dir).io), 0);
    const list = join(dir, "words.txt");
    writeFileSync(list, "# comment\n\n面交 # 自定义\n");
    const lint = captureIo(dir);
    assert.equal(main(["lint", "--in", out, "--banned", list], lint.io), 1);
    assert.match(lint.text().out, /面交/);
    assert.equal(main(["generate", "--in", "a.yaml", "--out", "b", "--extra", "面交"], captureIo(dir).io), 2);
    assert.equal(main(["generate", "--variants", "0", "--in", "a.yaml", "--out", "b"], captureIo(dir).io), 2);
    assert.equal(main(["lint", "--in", join(dir, "missing")], captureIo(dir).io), 2);
    const empty = join(dir, "empty");
    mkdirSync(empty);
    const emptyLint = captureIo(dir);
    assert.equal(main(["lint", "--in", empty], emptyLint.io), 2);
    assert.match(emptyLint.text().err, /没有可检查/);
    const fileOut = join(dir, "not-a-dir");
    writeFileSync(fileOut, "x");
    assert.equal(main(["generate", "--in", join(root, "fixtures/cad.yaml"), "--out", fileOut], captureIo(dir).io), 2);
  } finally {
    removeTemp(dir);
  }
});

test("the published bin runs offline", () => {
  const bin = join(root, "dist/bin.js");
  const source = readFileSync(bin, "utf8");
  assert.ok(source.startsWith("#!/usr/bin/env node"));
  const version = spawnSync(process.execPath, [bin, "--version"], { encoding: "utf8" });
  assert.equal(version.status, 0);
  assert.match(version.stdout, /0\.1\.0/);
  const dir = tempDir();
  try {
    const generated = spawnSync(process.execPath, [bin, "generate", "--in", join(root, "fixtures/n8n.yaml"), "--out", dir, "--tone", "short", "--variants", "1"], {
      encoding: "utf8",
    });
    assert.equal(generated.status, 0, generated.stderr);
    const lint = spawnSync(process.execPath, [bin, "lint", "--in", dir], { encoding: "utf8" });
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
    assert.match(lint.stdout, /未发现问题/);
  } finally {
    removeTemp(dir);
  }
});
