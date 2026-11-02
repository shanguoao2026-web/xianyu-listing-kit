import { UserError } from "./errors.js";

export interface ParsedArgs {
  command: string | null;
  help: boolean;
  version: boolean;
  force: boolean;
  llm: boolean;
  flags: Record<string, string>;
}

const TAKES_VALUE = new Set([
  "in",
  "out",
  "variants",
  "tone",
  "banned",
  "extra",
  "allow",
  "title-min",
  "title-max",
  "body-min",
  "body-max",
  "short-body-max",
]);

export function parseArgv(argv: readonly string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  let command: string | null = null;
  let help = false;
  let version = false;
  let force = false;
  let llm = false;
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;
    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }
    if (token === "--version" || token === "-V" || token === "-v") {
      version = true;
      continue;
    }
    if (token === "--force") {
      force = true;
      continue;
    }
    if (token === "--llm" || token.startsWith("--llm=")) {
      llm = true;
      continue;
    }
    if (token === "--") throw new UserError("不支持单独的 --");
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      const key = eq === -1 ? token.slice(2) : token.slice(2, eq);
      let value = eq === -1 ? null : token.slice(eq + 1);
      if (!TAKES_VALUE.has(key)) throw new UserError(`未知参数 --${key}`);
      if (value === null) {
        const next = argv[index + 1];
        if (next === undefined || next.startsWith("-")) throw new UserError(`参数 --${key} 需要一个值`);
        value = next;
        index += 1;
      }
      flags[key] = value;
      continue;
    }
    if (token.startsWith("-")) throw new UserError(`未知参数 ${token}`);
    if (command === null) command = token;
    else positionals.push(token);
  }
  if (positionals.length > 0) throw new UserError(`多余的参数：${positionals.join(" ")}`);
  return { command, help, version, force, llm, flags };
}
