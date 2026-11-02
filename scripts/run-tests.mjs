import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../dist-test/test/", import.meta.url));
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".test.js"))
  .map((name) => join(dir, name))
  .sort();

if (files.length === 0) {
  process.stderr.write("没有测试文件。\n");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
