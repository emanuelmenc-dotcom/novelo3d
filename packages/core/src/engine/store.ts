// SPDX-License-Identifier: GPL-3.0-or-later
// Motor de pontos (docs/15): vetores tipados com índice denso, uid permanente e propriedades em colunas.

import { BUILTIN_CODES } from "../stitches/registry.ts";
import type { StitchGraph } from "../types.ts";
import { hashKey } from "./hash.ts";

/** Códigos de ponto em vetor (Uint8): os tipos do registro, na ordem dos índices. */
export const CODES: readonly string[] = BUILTIN_CODES;
const CODE_INDEX: Record<string, number> = Object.fromEntries(CODES.map((c, i) => [c, i]));
export const codeIndex = (c: string): number => CODE_INDEX[c] ?? 3;

export type PropKind = "f32" | "u8" | "i32";
export type Column = Float32Array | Uint8Array | Int32Array;
export interface PropDef {
  name: string;
  kind: PropKind;
  default: number;
}

/** Propriedades conhecidas. `yarn` guarda o índice do fio na paleta (A=0, B=1...). */
export const PROPS: Record<string, PropDef> = {
  yarn: { name: "yarn", kind: "u8", default: 0 },
  tension: { name: "tension", kind: "f32", default: 0 },
};

function alloc(kind: PropKind, n: number): Column {
  return kind === "f32" ? new Float32Array(n) : kind === "u8" ? new Uint8Array(n) : new Int32Array(n);
}

export class PointStore {
  readonly n: number;
  /** Identidade permanente (1, 2, 3...), mostrada como #uid. */
  readonly uid: Int32Array;
  /** Ordem de trabalho. */
  readonly seq: Int32Array;
  readonly code: Uint8Array;
  readonly counted: Uint8Array;
  /** "Volta" (1-based, 0 = sem grupo) e posição dentro dela. */
  readonly group: Int32Array;
  readonly gIndex: Int32Array;
  /** Caminho do fio: ponto anterior e seguinte (-1 se não há). */
  readonly prev: Int32Array;
  readonly next: Int32Array;
  /** Pontos de base (CSR) e seus inversos, os filhos (CSR). */
  readonly pStart: Int32Array;
  readonly pAdj: Int32Array;
  readonly cStart: Int32Array;
  readonly cAdj: Int32Array;
  /** Posição 3D relativa ao primeiro ponto, 3 números por ponto (preenchida pelo layout). */
  readonly pos: Float32Array;
  /** Primeiro e último ponto de cada grupo (indexados pelo número do grupo) e se o grupo fecha em volta. */
  gFirst: Int32Array = new Int32Array(1);
  gLast: Int32Array = new Int32Array(1);
  gClosed: Uint8Array = new Uint8Array(1);
  /** Chave estrutural (hash) de cada grupo; índice 0 é o anel. Usada para casar voltas ao regenerar a peça. */
  roundKey: Uint32Array = new Uint32Array(1);
  /** Idem, incluindo o rótulo da linha (V3, V7–12...): serve de âncora quando há voltas iguais em sequência. */
  roundLabelKey: Uint32Array = new Uint32Array(1);
  readonly props = new Map<string, { def: PropDef; data: Column }>();
  private uidIndex: Int32Array | null = null;

  constructor(n: number, pEdges: number) {
    this.n = n;
    this.uid = new Int32Array(n);
    this.seq = new Int32Array(n);
    this.code = new Uint8Array(n);
    this.counted = new Uint8Array(n);
    this.group = new Int32Array(n);
    this.gIndex = new Int32Array(n);
    this.prev = new Int32Array(n).fill(-1);
    this.next = new Int32Array(n).fill(-1);
    this.pStart = new Int32Array(n + 1);
    this.pAdj = new Int32Array(pEdges);
    this.cStart = new Int32Array(n + 1);
    this.cAdj = new Int32Array(pEdges);
    this.pos = new Float32Array(n * 3);
  }

  /** Constrói o armazém a partir do grafo gerado pela receita. O(n). */
  static fromGraph(graph: StitchGraph, uids?: Int32Array): PointStore {
    const nodes = graph.nodes;
    const n = nodes.length;
    let pe = 0;
    for (const nd of nodes) pe += nd.parents.length;
    const s = new PointStore(n, pe);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      if (!nd) continue;
      s.uid[i] = uids ? (uids[i] as number) : i + 1;
      s.seq[i] = i;
      s.code[i] = codeIndex(nd.code);
      s.counted[i] = nd.counted ? 1 : 0;
      if (i > 0) s.prev[i] = i - 1;
      if (i < n - 1) s.next[i] = i + 1;
      s.pStart[i] = k;
      for (const p of nd.parents) s.pAdj[k++] = p;
    }
    s.pStart[n] = k;
    const g = graph.rows.length + 1;
    s.gFirst = new Int32Array(g).fill(-1);
    s.gLast = new Int32Array(g).fill(-1);
    s.gClosed = new Uint8Array(g);
    s.roundKey = new Uint32Array(g);
    s.roundLabelKey = new Uint32Array(g);
    graph.rows.forEach((row, ri) => {
      for (let i = row.first; i <= row.last; i++) {
        s.group[i] = ri + 1;
        s.gIndex[i] = i - row.first;
      }
      s.roundKey[ri + 1] = hashKey(row.key ?? row.label);
      s.roundLabelKey[ri + 1] = hashKey(`${row.label}§${row.key ?? ""}`);
      s.gFirst[ri + 1] = row.first;
      s.gLast[ri + 1] = row.last;
      s.gClosed[ri + 1] = row.kind === "round" && row.last - row.first >= 2 ? 1 : 0;
    });
    // filhos: inverso do CSR de bases
    const cnt = new Int32Array(n + 1);
    for (let e = 0; e < pe; e++) {
      const k = (s.pAdj[e] as number) + 1;
      cnt[k] = (cnt[k] as number) + 1;
    }
    for (let i = 0; i < n; i++) cnt[i + 1] = (cnt[i + 1] as number) + (cnt[i] as number);
    s.cStart.set(cnt);
    const fill = cnt.slice(0, n);
    for (let i = 0; i < n; i++) {
      for (let e = s.pStart[i] as number; e < (s.pStart[i + 1] as number); e++) {
        const p = s.pAdj[e] as number;
        s.cAdj[fill[p] as number] = i;
        fill[p] = (fill[p] as number) + 1;
      }
    }
    return s;
  }

  /** Coluna da propriedade (criada com o valor padrão na primeira vez). */
  col(name: string): Column {
    let c = this.props.get(name);
    if (!c) {
      const def = PROPS[name];
      if (!def) throw new Error(`propriedade '${name}' desconhecida`);
      const data = alloc(def.kind, this.n);
      if (def.default !== 0) data.fill(def.default);
      c = { def, data };
      this.props.set(name, c);
    }
    return c.data;
  }

  /** Índice denso do uid, ou -1. */
  indexOf(uid: number): number {
    if (!this.uidIndex) {
      let max = 0;
      for (let i = 0; i < this.n; i++) max = Math.max(max, this.uid[i] as number);
      this.uidIndex = new Int32Array(max + 1).fill(-1);
      for (let i = 0; i < this.n; i++) this.uidIndex[this.uid[i] as number] = i;
    }
    return uid >= 0 && uid < this.uidIndex.length ? (this.uidIndex[uid] as number) : -1;
  }

  /** Percorre os vizinhos do ponto: anterior, seguinte, bases e filhos. Sem alocar. */
  forNeighbors(i: number, fn: (j: number) => void): void {
    const pv = this.prev[i] as number;
    const nx = this.next[i] as number;
    if (pv >= 0) fn(pv);
    if (nx >= 0) fn(nx);
    for (let e = this.pStart[i] as number; e < (this.pStart[i + 1] as number); e++)
      fn(this.pAdj[e] as number);
    for (let e = this.cStart[i] as number; e < (this.cStart[i + 1] as number); e++)
      fn(this.cAdj[e] as number);
    // volta fechada: o último ponto encosta no primeiro
    const g = this.group[i] as number;
    if (g > 0 && this.gClosed[g]) {
      if (i === this.gFirst[g]) fn(this.gLast[g] as number);
      else if (i === this.gLast[g]) fn(this.gFirst[g] as number);
    }
  }
}
