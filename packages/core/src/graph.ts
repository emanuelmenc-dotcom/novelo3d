// SPDX-License-Identifier: GPL-3.0-or-later
import { simulateRow, type Top } from "./simulate.ts";
import type { Pattern, StitchGraph, StitchNode } from "./types.ts";

/** Grafo de pontos derivado da receita (nunca editado diretamente). Docs 06 seção 7. */
export function buildGraph(pattern: Pattern): StitchGraph {
  const nodes: StitchNode[] = [];
  const rows: StitchGraph["rows"] = [];
  let prev: Top[] = [];
  let rowIndex = 0;

  pattern.rows.forEach((row, ri) => {
    const first = ri === 0;
    if (first && row.start === "magicRing") {
      nodes.push({
        id: 0,
        rowIndex: -1,
        indexInRow: 0,
        code: "RING",
        counted: false,
        parents: [],
        yarnId: row.yarnId ?? "A",
      });
      prev = [{ id: 0, counted: false }];
    }
    const reps = row.repeatRows ?? 1;
    for (let rep = 0; rep < reps; rep++) {
      const free = (first || row.start !== undefined) && rep === 0;
      const sim = simulateRow(row, prev, nodes.length, free);
      const start = nodes.length;
      sim.nodes.forEach((n, i) => {
        const node: StitchNode = {
          id: n.id,
          rowIndex,
          indexInRow: i,
          code: n.code,
          counted: n.counted,
          parents: first && rep === 0 && row.start === "magicRing" ? [0] : n.parents,
          yarnId: row.yarnId ?? "A",
        };
        if (n.groupWith !== undefined) node.groupWith = n.groupWith;
        nodes.push(node);
      });
      // chave estrutural da volta (operações, início e repetição): não muda com rótulo nem contagem declarada
      const key = `${JSON.stringify(row.ops)}|${row.start ?? ""}|${rep}`;
      rows.push({ label: row.label, kind: row.kind, first: start, last: nodes.length - 1, key });
      prev = sim.nodes.map((n) => ({ id: n.id, counted: n.counted }));
      rowIndex++;
    }
  });
  return { nodes, rows };
}
