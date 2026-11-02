import type { ServiceInput } from "./types.js";
import { displayWidth, formatPrice } from "./text.js";

export function renderPriceTableMarkdown(service: ServiceInput): string {
  const lines = [
    "| 套餐 | 价格 | 包含 |",
    "| --- | ---: | --- |",
    ...service.tiers.map(
      (tier) =>
        `| ${escapeCell(tier.name)} | ${escapeCell(`¥${formatPrice(tier.price)}`)} | ${escapeCell(tier.includes.join("、"))} |`,
    ),
  ];
  return lines.join("\n");
}

export function renderPriceTablePlain(service: ServiceInput): string {
  const headers = ["套餐", "价格", "包含"];
  const rows = service.tiers.map((tier) => [tier.name, `¥${formatPrice(tier.price)}`, tier.includes.join("、")]);
  const widths = [0, 1, 2].map((index) => {
    const cells = [headers[index] ?? "", ...rows.map((row) => row[index] ?? "")];
    return Math.max(...cells.map((cell) => displayWidth(cell)));
  });
  const align: Array<"L" | "R"> = ["L", "R", "L"];
  const formatRow = (cells: string[]): string =>
    cells
      .map((cell, index) => {
        const width = widths[index] ?? 0;
        return align[index] === "R" ? padLeft(cell, width) : padRight(cell, width);
      })
      .join("  ");
  const rendered = [formatRow(headers), ...rows.map((row) => formatRow(row))];
  const rule = "-".repeat(displayWidth(rendered[0] ?? ""));
  return `${rendered[0]}\n${rule}\n${rendered.slice(1).join("\n")}\n`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function padRight(value: string, width: number): string {
  const gap = width - displayWidth(value);
  return gap > 0 ? value + " ".repeat(gap) : value;
}

function padLeft(value: string, width: number): string {
  const gap = width - displayWidth(value);
  return gap > 0 ? " ".repeat(gap) + value : value;
}
