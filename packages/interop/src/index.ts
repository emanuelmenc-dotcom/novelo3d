// SPDX-License-Identifier: GPL-3.0-or-later
// Interoperabilidade opcional (CrochetPARADE). Formato `.dot` observado na F0:
//   linha 1: dimensão; nós "volta,ponto|índice" {x,y,z}; arestas "a" -- "b" peso.
import type { Issue, Result } from "@novelo/core";

export { fromCp, toCp } from "./cp.ts";

export interface DotNode {
  name: string;
  pos: number[];
}
export interface DotEdge {
  a: string;
  b: string;
  weight: number;
}
export interface DotGraph {
  dim: number;
  nodes: DotNode[];
  edges: DotEdge[];
}

const NODE = /^"([^"]+)"\s*\{([^}]*)\}\s*$/;
const EDGE = /^"([^"]+)"\s*--\s*"([^"]+)"\s+(\S+)\s*$/;

export function parseCpDot(text: string): Result<DotGraph> {
  const lines = text.split(/\r?\n/);
  const dim = Number.parseInt(lines[0] ?? "", 10);
  if (!(dim === 2 || dim === 3)) {
    return { ok: false, issues: [{ code: "DOT_BAD_DIM", message: "Primeira linha deve ser 2 ou 3." }] };
  }
  const nodes: DotNode[] = [];
  const edges: DotEdge[] = [];
  const issues: Issue[] = [];
  for (const [i, raw] of lines.slice(1).entries()) {
    const line = raw.trim();
    if (line === "") continue;
    const n = NODE.exec(line);
    if (n) {
      const pos = (n[2] ?? "").split(",").map(Number);
      if (pos.length !== dim || pos.some(Number.isNaN)) {
        issues.push({ code: "DOT_BAD_POS", message: `Posição inválida na linha ${i + 2}.` });
      } else nodes.push({ name: n[1] ?? "", pos });
      continue;
    }
    const e = EDGE.exec(line);
    if (e) {
      edges.push({ a: e[1] ?? "", b: e[2] ?? "", weight: Number(e[3]) });
      continue;
    }
    issues.push({ code: "DOT_UNKNOWN_LINE", message: `Linha ${i + 2} não reconhecida.` });
  }
  return { ok: true, value: { dim, nodes, edges }, issues };
}
