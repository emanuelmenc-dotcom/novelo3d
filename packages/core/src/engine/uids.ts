// SPDX-License-Identifier: GPL-3.0-or-later
// Identidade permanente dos pontos (docs/15): ao regenerar a peça, os pontos casados por diferença de sequência
// mantêm o uid; os novos ganham uids novos e nunca se reutiliza um número.
import type { PointStore } from "./store.ts";

/** Assinatura de cada ponto: código, se conta, quantas bases tem e se abre um grupo (volta). */
export function signatures(s: PointStore): Uint32Array {
  const out = new Uint32Array(s.n);
  for (let i = 0; i < s.n; i++) {
    const nb = (s.pStart[i + 1] as number) - (s.pStart[i] as number);
    const opens = s.group[i] !== s.group[i - 1] || i === 0 ? 1 : 0;
    out[i] =
      ((s.code[i] as number) | ((s.counted[i] as number) << 4) | (Math.min(nb, 15) << 5) | (opens << 9)) >>>
      0;
  }
  return out;
}

const MAX_D = 1200; // teto da diferença; acima disso o miolo fica sem correspondência

/** Para cada posição de `b`, a posição correspondente em `a` (ou -1). Prefixo/sufixo comuns + Myers O(ND). */
export function align(a: Uint32Array, b: Uint32Array, trimSuffix = true): Int32Array {
  const out = new Int32Array(b.length).fill(-1);
  let pre = 0;
  const lim = Math.min(a.length, b.length);
  while (pre < lim && a[pre] === b[pre]) {
    out[pre] = pre;
    pre++;
  }
  let sa = a.length;
  let sb = b.length;
  // sem aparar o sufixo, blocos de itens iguais casam pelo começo (o que foi inserido fica depois do bloco)
  while (trimSuffix && sa > pre && sb > pre && a[sa - 1] === b[sb - 1]) {
    out[sb - 1] = sa - 1;
    sa--;
    sb--;
  }
  const N = sa - pre;
  const M = sb - pre;
  if (N === 0 || M === 0) return out;

  // Myers guloso com histórico para refazer o caminho
  const MAX = Math.min(N + M, MAX_D);
  const off = MAX + 1;
  let v = new Int32Array(2 * MAX + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= MAX && found < 0; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      const down = k === -d || (k !== d && (v[off + k - 1] as number) < (v[off + k + 1] as number));
      x = down ? (v[off + k + 1] as number) : (v[off + k - 1] as number) + 1;
      let y = x - k;
      while (x < N && y < M && a[pre + x] === b[pre + y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= N && y >= M) {
        found = d;
        break;
      }
    }
    v = v.slice();
  }
  if (found < 0) return out; // diferença grande demais: miolo sem correspondência
  // refaz o caminho de trás para frente
  let x = N;
  let y = M;
  for (let d = found; d > 0; d--) {
    const vd = trace[d] as Int32Array;
    const k = x - y;
    const down = k === -d || (k !== d && (vd[off + k - 1] as number) < (vd[off + k + 1] as number));
    const pk = down ? k + 1 : k - 1;
    const px = vd[off + pk] as number;
    const py = px - pk;
    while (x > (down ? px : px + 1) && y > (down ? py + 1 : py)) {
      out[pre + y - 1] = pre + x - 1;
      x--;
      y--;
    }
    x = px;
    y = py;
  }
  while (x > 0 && y > 0) {
    out[pre + y - 1] = pre + x - 1;
    x--;
    y--;
  }
  return out;
}

export interface UidState {
  sigs: Uint32Array;
  uids: Int32Array;
  /** Grupo de cada ponto e chave de cada grupo (só em estados novos; sem isso o casamento é por pontos). */
  group?: Int32Array;
  keys?: Uint32Array;
  lkeys?: Uint32Array;
  /** Próximo uid livre. */
  next: number;
}

/** Atribui uids à peça recém-gerada, reaproveitando os da geração anterior pelos pontos que casam. */
export function assignUids(prev: UidState | null, sigs: Uint32Array): UidState {
  const n = sigs.length;
  const uids = new Int32Array(n);
  if (!prev) {
    for (let i = 0; i < n; i++) uids[i] = i + 1;
    return { sigs, uids, next: n + 1 };
  }
  const map = align(prev.sigs, sigs);
  let next = prev.next;
  for (let i = 0; i < n; i++) {
    const m = map[i] as number;
    uids[i] = m >= 0 ? (prev.uids[m] as number) : next++;
  }
  return { sigs, uids, next };
}

/** Início de cada grupo (grupos contíguos e crescentes; o grupo 0 é o anel, se houver). */
function starts(group: Int32Array, G: number): Int32Array {
  const out = new Int32Array(G + 2).fill(group.length);
  for (let i = group.length - 1; i >= 0; i--) out[group[i] as number] = i;
  for (let g = G; g >= 0; g--) if ((out[g] as number) > (out[g + 1] as number)) out[g] = out[g + 1] as number;
  return out;
}

/** Maior subsequência crescente de `v` (índices em v), O(n log n). */
function lis(v: number[]): number[] {
  const tails: number[] = [];
  const prev: number[] = new Array(v.length).fill(-1);
  const idx: number[] = [];
  for (let i = 0; i < v.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((v[tails[mid] as number] as number) < (v[i] as number)) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1] as number;
    tails[lo] = i;
    idx[lo] = i;
  }
  const out: number[] = [];
  for (let k = tails[tails.length - 1] ?? -1; k >= 0; k = prev[k] as number) out.push(k);
  return out.reverse();
}

/**
 * Casa as voltas da receita anterior com as da nova: voltas com o mesmo rótulo e a mesma estrutura, únicas nos dois
 * lados, servem de âncora (como na diferença "paciente"); entre as âncoras casa-se só pela estrutura, do começo do bloco.
 * Assim editar uma volta no meio de várias iguais não desloca as seguintes, e inserir uma volta nova não as arrasta.
 */
function alignRounds(pl: Uint32Array, ps: Uint32Array, cl: Uint32Array, cs: Uint32Array): Int32Array {
  const out = new Int32Array(cl.length).fill(-1);
  const count = (a: Uint32Array) => {
    const m = new Map<number, number>();
    for (const x of a) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const pc = count(pl);
  const cc = count(cl);
  const where = new Map<number, number>();
  pl.forEach((x, i) => {
    if (pc.get(x) === 1) where.set(x, i);
  });
  const jIdx: number[] = [];
  const iVal: number[] = [];
  cl.forEach((x, j) => {
    if (cc.get(x) === 1 && where.has(x)) {
      jIdx.push(j);
      iVal.push(where.get(x) as number);
    }
  });
  const anchors = lis(iVal).map((k) => [jIdx[k] as number, iVal[k] as number] as const);
  let pi = 0;
  let cj = 0;
  const gap = (pEnd: number, cEnd: number) => {
    if (pEnd > pi && cEnd > cj) {
      const m = align(ps.subarray(pi, pEnd), cs.subarray(cj, cEnd), false);
      for (let k = 0; k < m.length; k++) if ((m[k] as number) >= 0) out[cj + k] = pi + (m[k] as number);
    }
  };
  for (const [j, i] of anchors) {
    gap(i, j);
    out[j] = i;
    pi = i + 1;
    cj = j + 1;
  }
  gap(pl.length, cl.length);
  return out;
}

/**
 * Casamento em dois níveis: primeiro as voltas (âncoras por rótulo + estrutura; depois pela estrutura), depois os
 * pontos dentro de cada par de voltas casadas. Volta sem par recebe uids novos. Uma mudança no começo da receita não
 * arrasta a pintura das voltas que ficaram iguais, nem a leva para outra volta de aparência igual.
 */
export function assignUidsByRounds(
  prev: UidState | null,
  sigs: Uint32Array,
  group: Int32Array,
  keys: Uint32Array,
  lkeys: Uint32Array,
): UidState {
  const n = sigs.length;
  if (!prev || !prev.group || !prev.keys || !prev.lkeys) {
    const st = assignUids(prev, sigs);
    return { ...st, group, keys, lkeys };
  }
  const G = keys.length - 1;
  const PG = prev.keys.length - 1;
  const rmap = alignRounds(
    prev.lkeys.subarray(1),
    prev.keys.subarray(1),
    lkeys.subarray(1),
    keys.subarray(1),
  );
  const ps = starts(prev.group, PG);
  const cs = starts(group, G);
  const uids = new Int32Array(n).fill(-1);
  const fixed = (pg: number, cg: number) => {
    const pa = prev.sigs.subarray(ps[pg] as number, ps[pg + 1] as number);
    const ca = sigs.subarray(cs[cg] as number, cs[cg + 1] as number);
    const m = align(pa, ca, false);
    for (let k = 0; k < ca.length; k++) {
      const pi = m[k] as number;
      if (pi >= 0) uids[(cs[cg] as number) + k] = prev.uids[(ps[pg] as number) + pi] as number;
    }
  };
  // anel mágico (grupo 0)
  if ((cs[1] as number) > (cs[0] as number) && (ps[1] as number) > (ps[0] as number)) {
    uids[cs[0] as number] = prev.uids[ps[0] as number] as number;
  }
  for (let g = 1; g <= G; g++) {
    const m = rmap[g - 1] as number;
    if (m >= 0) fixed(m + 1, g);
  }
  let next = prev.next;
  for (let i = 0; i < n; i++) if ((uids[i] as number) < 0) uids[i] = next++;
  return { sigs, uids, next, group, keys, lkeys };
}
