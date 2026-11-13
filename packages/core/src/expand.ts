// SPDX-License-Identifier: GPL-3.0-or-later
import { simulateRow, type Top } from "./simulate.ts";
import type { Atom, Pattern, Row } from "./types.ts";

export interface ExpandedRow {
  row: Row;
  /** Operações expandidas da primeira repetição da linha (sem "rest" nem repetições). */
  atoms: Atom[];
  /** Topos contados na volta anterior. */
  prevCounted: number;
  /** Pontos contados produzidos pela primeira repetição. */
  produced: number;
  /** Quantas voltas esta linha representa. */
  reps: number;
}

/** Uma volta já expandida (cada repetição de "V7–12" é uma volta). */
export interface Round {
  /** Número da volta, a partir de 1. */
  round: number;
  row: Row;
  atoms: Atom[];
  prevCounted: number;
  produced: number;
  /** Id do primeiro nó produzido pela volta e quantos nós ela produz. */
  firstId: number;
  nodeCount: number;
  /** Para cada operação, o id do primeiro nó que ela produz, ou -1 se não produz nenhum (pular, junção, nota). */
  atomNode: number[];
}

const nodesOf = (a: Atom): number => {
  switch (a.kind) {
    case "stitch":
    case "dec":
    case "slInto":
      return 1;
    case "inc":
      return a.k;
    default:
      return 0;
  }
};

/** Todas as voltas, uma por uma, com a ligação operação -> nós do grafo (mesma numeração de `buildGraph`). */
export function expandRounds(pattern: Pattern): Round[] {
  const out: Round[] = [];
  let prev: Top[] = [];
  let nextId = 0;
  let round = 0;
  pattern.rows.forEach((row, ri) => {
    const first = ri === 0;
    if (first && row.start === "magicRing") prev = [{ id: nextId++, counted: false }];
    const reps = row.repeatRows ?? 1;
    for (let rep = 0; rep < reps; rep++) {
      const prevCounted = prev.filter((t) => t.counted).length;
      const sim = simulateRow(row, prev, nextId, (first || row.start !== undefined) && rep === 0);
      let id = nextId;
      const atomNode = sim.atoms.map((a) => {
        const n = nodesOf(a);
        const at = n > 0 ? id : -1;
        id += n;
        return at;
      });
      round++;
      out.push({
        round,
        row,
        atoms: sim.atoms,
        prevCounted,
        produced: sim.producedCounted,
        firstId: nextId,
        nodeCount: sim.nodes.length,
        atomNode,
      });
      nextId += sim.nodes.length;
      prev = sim.nodes.map((n) => ({ id: n.id, counted: n.counted }));
    }
  });
  return out;
}

/** Expande cada linha uma vez (base do impressor, do gráfico e do tradutor CrochetPARADE). */
export function expandPattern(pattern: Pattern): ExpandedRow[] {
  const out: ExpandedRow[] = [];
  let prev: Top[] = [];
  let nextId = 0;
  pattern.rows.forEach((row, ri) => {
    const first = ri === 0;
    if (first && row.start === "magicRing") prev = [{ id: nextId++, counted: false }];
    const reps = row.repeatRows ?? 1;
    for (let rep = 0; rep < reps; rep++) {
      const prevCounted = prev.filter((t) => t.counted).length;
      const sim = simulateRow(row, prev, nextId, (first || row.start !== undefined) && rep === 0);
      nextId += sim.nodes.length;
      if (rep === 0) out.push({ row, atoms: sim.atoms, prevCounted, produced: sim.producedCounted, reps });
      prev = sim.nodes.map((n) => ({ id: n.id, counted: n.counted }));
    }
  });
  return out;
}
