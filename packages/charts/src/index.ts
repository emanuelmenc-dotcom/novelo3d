// SPDX-License-Identifier: GPL-3.0-or-later
// Gráficos de símbolos: layout circular em SVG A4 (docs/10 seção 2).
import { roundCount } from "@novelo/core";

export { type ChartOptions, type ChartPage, type ChartResult, renderChart } from "./chart.ts";
export { type Item, layoutRing, WIDTH } from "./layout.ts";
export { type StitchDiagramOptions, stitchDiagramSvg } from "./stitch-diagram.ts";

/** Raio mínimo (em unidades de símbolo) para `n` símbolos lado a lado numa volta. */
export function minRingRadius(n: number): number {
  return roundCount(((n * 1.2) / (2 * Math.PI)) * 100) / 100;
}
