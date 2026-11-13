// SPDX-License-Identifier: GPL-3.0-or-later
// Núcleo: tipos, simulação, validação e grafo. Sem DOM, relógio nem aleatoriedade.

export * from "./engine/index.ts";
export { type ExpandedRow, expandPattern, expandRounds, type Round } from "./expand.ts";
export { buildGraph } from "./graph.ts";
export * from "./paint.ts";
export { type SimNode, type SimResult, simulateRow, type Top } from "./simulate.ts";
export * as stitchBuilder from "./stitches/builder.ts";
export * from "./stitches/registry.ts";
export * from "./types.ts";
export { validate } from "./validate.ts";
export * from "./yarnlib.ts";

/** Arredondamento de contagens do projeto. */
export function roundCount(x: number): number {
  return Math.floor(x + 0.5);
}
