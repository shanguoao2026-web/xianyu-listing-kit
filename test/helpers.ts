import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Io } from "../src/cli.js";
import { findPackageRoot } from "../src/package-info.js";

export function projectRoot(): string {
  return findPackageRoot();
}

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "xyk-"));
}

export function removeTemp(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function captureIo(cwd: string): { io: Io; text: () => { out: string; err: string } } {
  let out = "";
  let err = "";
  return {
    io: {
      cwd,
      stdout(chunk: string) {
        out += chunk;
      },
      stderr(chunk: string) {
        err += chunk;
      },
    },
    text() {
      return { out, err };
    },
  };
}
