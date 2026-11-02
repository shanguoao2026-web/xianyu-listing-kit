#!/usr/bin/env node
import { main } from "./cli.js";

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}
