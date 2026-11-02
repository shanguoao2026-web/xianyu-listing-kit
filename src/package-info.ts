import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRecord } from "./types.js";

export interface PackageInfo {
  root: string;
  version: string;
}

let cached: PackageInfo | undefined;

export function readPackageInfo(): PackageInfo {
  if (cached) return cached;
  const root = findPackageRoot();
  const raw: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (!isRecord(raw) || typeof raw.version !== "string") throw new Error("package.json 缺少 version");
  cached = { root, version: raw.version };
  return cached;
}

export function findPackageRoot(start?: string): string {
  let dir = start ?? dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg: unknown = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (isRecord(pkg) && pkg.name === "xianyu-listing-kit") return dir;
      } catch {
        // 继续向上找。
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("找不到 xianyu-listing-kit 的 package.json");
}

export const VERSION = readPackageInfo().version;
