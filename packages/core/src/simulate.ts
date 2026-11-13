// SPDX-License-Identifier: GPL-3.0-or-later
// Simulação do trabalho de uma volta sobre os topos da anterior (docs/06 seções 5 e 6).
import type { Atom, Op, Row, StitchCode } from "./types.ts";

export interface Top {
  id: number;
  counted: boolean;
}

export interface SimNode {
  id: number;
  code: StitchCode;
  counted: boolean;
  parents: number[];
  groupWith?: number;
}

export interface SimResult {
  nodes: SimNode[];
  atoms: Atom[];
  consumedCounted: number;
  over: number;
  unused: number;
  producedCounted: number;
}

/**
 * Simula uma volta. `free` = volta inicial (anel/corrente): não consome topos.
 * Topos não contados são pulados em silêncio por operações comuns.
 */
export function simulateRow(row: Row, prev: Top[], nextId: number, free: boolean): SimResult {
  const nodes: SimNode[] = [];
  const atoms: Atom[] = [];
  const prevCounted = prev.filter((t) => t.counted).length;
  let cursor = 0;
  let consumed = 0;
  let over = 0;

  const take = (counted: boolean): number | undefined => {
    if (free) return undefined;
    while (cursor < prev.length && prev[cursor]?.counted !== counted) cursor++;
    const top = prev[cursor];
    if (!top) {
      if (counted) over++;
      return undefined;
    }
    cursor++;
    if (counted) consumed++;
    return top.id;
  };
  const resolve = (c: number | "rest"): number => (c === "rest" ? Math.max(0, prevCounted - consumed) : c);
  const produce = (
    code: StitchCode,
    counted: boolean,
    parents: (number | undefined)[],
    groupWith?: number,
  ): number => {
    const id = nextId + nodes.length;
    const node: SimNode = { id, code, counted, parents: parents.filter((p): p is number => p !== undefined) };
    if (groupWith !== undefined) node.groupWith = groupWith;
    nodes.push(node);
    return id;
  };

  const run = (ops: Op[]): void => {
    for (const op of ops) {
      switch (op.kind) {
        case "stitch": {
          const n = resolve(op.count);
          for (let i = 0; i < n; i++) {
            if (op.code === "CH") {
              const counted = op.counted ?? true;
              produce("CH", counted, []);
              atoms.push({ kind: "stitch", code: "CH", counted });
            } else if (op.code === "SL") {
              const counted = op.counted ?? false;
              produce("SL", counted, [take(true)]);
              atoms.push({ kind: "stitch", code: "SL", counted });
            } else {
              produce(op.code, true, [take(true)]);
              atoms.push({ kind: "stitch", code: op.code, counted: true });
            }
          }
          break;
        }
        case "inc": {
          const n = resolve(op.count);
          for (let i = 0; i < n; i++) {
            const p = take(true);
            const first = produce("SC", true, [p]);
            for (let j = 1; j < op.k; j++) produce("SC", true, [p], first);
            atoms.push({ kind: "inc", k: op.k });
          }
          break;
        }
        case "dec": {
          for (let i = 0; i < op.count; i++) {
            const ps: (number | undefined)[] = [];
            for (let j = 0; j < op.k; j++) ps.push(take(true));
            produce("SC", true, ps);
            atoms.push({ kind: "dec", k: op.k });
          }
          break;
        }
        case "repeat":
          for (let i = 0; i < op.times; i++) run(op.ops);
          break;
        case "skip": {
          const n = resolve(op.count);
          for (let i = 0; i < n; i++) {
            take(true);
            atoms.push({ kind: "skip" });
          }
          break;
        }
        case "slInto": {
          for (let i = 0; i < op.count; i++) {
            produce("SL", false, [take(false)]);
            atoms.push({ kind: "slInto" });
          }
          break;
        }
        case "join":
          atoms.push({ kind: "join" });
          break;
        case "marker":
          atoms.push({ kind: "marker", text: op.text });
          break;
      }
    }
  };
  run(row.ops);

  const unused = free ? 0 : Math.max(0, prevCounted - consumed);
  return {
    nodes,
    atoms,
    consumedCounted: consumed,
    over,
    unused,
    producedCounted: nodes.filter((n) => n.counted).length,
  };
}
