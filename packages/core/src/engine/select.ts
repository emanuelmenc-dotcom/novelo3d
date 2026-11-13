// SPDX-License-Identifier: GPL-3.0-or-later
// Motor de seleção (docs/15): máscaras Uint8Array, operações booleanas, filtros, estrutura (volta, coluna, caminho,
// vizinhança), formas 3D e formas na tela, e cadeias lineares para costuras. Todas as funções são O(n) ou O(n+m).
import type { PointStore } from "./store.ts";

export type Mask = Uint8Array;
export type SelOp = "replace" | "add" | "remove" | "intersect";

export const newMask = (n: number): Mask => new Uint8Array(n);

export function maskCount(m: Mask): number {
  let c = 0;
  for (let i = 0; i < m.length; i++) c += m[i] as number;
  return c;
}

export function maskIndices(m: Mask): Int32Array {
  const out = new Int32Array(maskCount(m));
  let k = 0;
  for (let i = 0; i < m.length; i++) if (m[i]) out[k++] = i;
  return out;
}

export function maskFrom(n: number, idx: ArrayLike<number>): Mask {
  const m = newMask(n);
  for (let i = 0; i < idx.length; i++) {
    const j = idx[i] as number;
    if (j >= 0 && j < n) m[j] = 1;
  }
  return m;
}

/** Combina a seleção atual com uma nova: substituir, somar, tirar ou interseção. */
export function combine(base: Mask, sel: Mask, op: SelOp): Mask {
  const out = newMask(base.length);
  for (let i = 0; i < out.length; i++) {
    const a = base[i] as number;
    const b = sel[i] as number;
    out[i] = op === "replace" ? b : op === "add" ? (a | b) & 1 : op === "remove" ? a & (b ^ 1) : a & b;
  }
  return out;
}

export function invert(m: Mask): Mask {
  const out = newMask(m.length);
  for (let i = 0; i < out.length; i++) out[i] = (m[i] as number) ^ 1;
  return out;
}

// ---------------------------------------------------------------- filtros por propriedade

export interface Filter {
  /** Índices de fio na paleta (A=0, B=1...). */
  yarns?: number[];
  /** Faixa de tensão, inclusive. */
  tension?: [number, number];
  /** Códigos de ponto (índices de CODES). */
  codes?: number[];
  /** Faixa de grupo/volta, inclusive (1-based). */
  group?: [number, number];
  /** Faixa de ordem de trabalho, inclusive. */
  seq?: [number, number];
  counted?: boolean;
  /** Restringe a uma máscara (ex.: a seleção atual). */
  within?: Mask;
}

/** Pontos que passam em todos os critérios informados. */
export function filterMask(s: PointStore, f: Filter): Mask {
  const m = newMask(s.n);
  const yarn = f.yarns ? s.col("yarn") : null;
  const tension = f.tension ? s.col("tension") : null;
  const yset = f.yarns ? new Set(f.yarns) : null;
  const cset = f.codes ? new Set(f.codes) : null;
  for (let i = 0; i < s.n; i++) {
    if (f.within && !f.within[i]) continue;
    if (yset && yarn && !yset.has(yarn[i] as number)) continue;
    if (tension && f.tension) {
      const t = tension[i] as number;
      if (t < f.tension[0] - 1e-6 || t > f.tension[1] + 1e-6) continue;
    }
    if (cset && !cset.has(s.code[i] as number)) continue;
    if (f.group && ((s.group[i] as number) < f.group[0] || (s.group[i] as number) > f.group[1])) continue;
    if (f.seq && ((s.seq[i] as number) < f.seq[0] || (s.seq[i] as number) > f.seq[1])) continue;
    if (f.counted !== undefined && (s.counted[i] === 1) !== f.counted) continue;
    m[i] = 1;
  }
  return m;
}

// ---------------------------------------------------------------- estrutura

/** Todos os pontos de um grupo/volta. */
export const byGroup = (s: PointStore, from: number, to = from): Mask => filterMask(s, { group: [from, to] });

/** "Linha de pontos": a coluna que passa pelo ponto, seguindo as bases para baixo e os filhos para cima. */
export function byColumn(s: PointStore, i: number): Mask {
  const m = newMask(s.n);
  if (i < 0 || i >= s.n) return m;
  m[i] = 1;
  let cur = i;
  while ((s.pStart[cur + 1] as number) > (s.pStart[cur] as number)) {
    cur = s.pAdj[s.pStart[cur] as number] as number;
    if (m[cur]) break;
    m[cur] = 1;
  }
  cur = i;
  while ((s.cStart[cur + 1] as number) > (s.cStart[cur] as number)) {
    cur = s.cAdj[s.cStart[cur] as number] as number;
    if (m[cur]) break;
    m[cur] = 1;
  }
  return m;
}

/** Vizinhança de até `hops` saltos (BFS pelos vizinhos do armazém), limitada a `within` se informado. */
export function neighborhood(s: PointStore, i: number, hops: number, within?: Mask): Mask {
  const m = newMask(s.n);
  if (i < 0 || i >= s.n || (within && !within[i])) return m;
  const dist = new Int32Array(s.n).fill(-1);
  const q = new Int32Array(s.n);
  let h = 0;
  let t = 0;
  dist[i] = 0;
  q[t++] = i;
  m[i] = 1;
  while (h < t) {
    const u = q[h++] as number;
    const d = dist[u] as number;
    if (d >= hops) continue;
    s.forNeighbors(u, (v) => {
      if (dist[v] !== -1 || (within && !within[v])) return;
      dist[v] = d + 1;
      m[v] = 1;
      q[t++] = v;
    });
  }
  return m;
}

/** Caminho do fio entre A e B (todos os pontos da ordem de trabalho entre os dois, inclusive), em ordem. */
export function pathYarn(s: PointStore, a: number, b: number): number[] {
  if (a < 0 || b < 0 || a >= s.n || b >= s.n) return [];
  const lo = Math.min(s.seq[a] as number, s.seq[b] as number);
  const hi = Math.max(s.seq[a] as number, s.seq[b] as number);
  const out: number[] = [];
  for (let i = 0; i < s.n; i++) if ((s.seq[i] as number) >= lo && (s.seq[i] as number) <= hi) out.push(i);
  out.sort((x, y) => (s.seq[x] as number) - (s.seq[y] as number));
  if (out[0] !== a) out.reverse();
  return out;
}

/** Caminho mais curto entre A e B pelos vizinhos (BFS), em ordem; vazio se não há. */
export function pathShortest(s: PointStore, a: number, b: number, within?: Mask): number[] {
  if (a < 0 || b < 0 || a >= s.n || b >= s.n) return [];
  if (a === b) return [a];
  const from = new Int32Array(s.n).fill(-2);
  const q = new Int32Array(s.n);
  let h = 0;
  let t = 0;
  from[a] = -1;
  q[t++] = a;
  while (h < t && from[b] === -2) {
    const u = q[h++] as number;
    s.forNeighbors(u, (v) => {
      if (from[v] !== -2 || (within && !within[v])) return;
      from[v] = u;
      q[t++] = v;
    });
  }
  if (from[b] === -2) return [];
  const path: number[] = [];
  for (let c = b; c !== -1; c = from[c] as number) path.push(c);
  return path.reverse();
}

// ---------------------------------------------------------------- formas 3D (usam as posições do layout)

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function scan(s: PointStore, test: (x: number, y: number, z: number) => boolean): Mask {
  const m = newMask(s.n);
  for (let i = 0; i < s.n; i++) {
    if (test(s.pos[i * 3] as number, s.pos[i * 3 + 1] as number, s.pos[i * 3 + 2] as number)) m[i] = 1;
  }
  return m;
}

export const sphere = (s: PointStore, c: Vec3, r: number): Mask =>
  scan(s, (x, y, z) => (x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2 <= r * r);

export const ellipsoid = (s: PointStore, c: Vec3, r: Vec3): Mask =>
  scan(s, (x, y, z) => ((x - c.x) / r.x) ** 2 + ((y - c.y) / r.y) ** 2 + ((z - c.z) / r.z) ** 2 <= 1);

export const box = (s: PointStore, min: Vec3, max: Vec3): Mask =>
  scan(s, (x, y, z) => x >= min.x && x <= max.x && y >= min.y && y <= max.y && z >= min.z && z <= max.z);

/** Corredor: pontos a no máximo `r` do segmento A-B. */
export function corridor(s: PointStore, a: Vec3, b: Vec3, r: number): Mask {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz || 1;
  return scan(s, (x, y, z) => {
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / len2));
    const px = a.x + t * dx - x;
    const py = a.y + t * dy - y;
    const pz = a.z + t * dz - z;
    return px * px + py * py + pz * pz <= r * r;
  });
}

/** Fatia: pontos a no máximo `half` do plano que passa por `p` com normal `n`. */
export function slab(s: PointStore, p: Vec3, n: Vec3, half: number): Mask {
  const L = Math.hypot(n.x, n.y, n.z) || 1;
  return scan(s, (x, y, z) => Math.abs(((x - p.x) * n.x + (y - p.y) * n.y + (z - p.z) * n.z) / L) <= half);
}

// ---------------------------------------------------------------- formas na tela (xy = projeção dos pontos)

function scan2(
  xy: ArrayLike<number>,
  n: number,
  visible: Mask | undefined,
  test: (x: number, y: number) => boolean,
): Mask {
  const m = newMask(n);
  for (let i = 0; i < n; i++) {
    if (visible && !visible[i]) continue;
    if (test(xy[i * 2] as number, xy[i * 2 + 1] as number)) m[i] = 1;
  }
  return m;
}

export const rect2d = (
  xy: ArrayLike<number>,
  n: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  vis?: Mask,
) =>
  scan2(
    xy,
    n,
    vis,
    (x, y) =>
      x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1),
  );

export const ellipse2d = (
  xy: ArrayLike<number>,
  n: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  vis?: Mask,
) => scan2(xy, n, vis, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);

/** Laço: polígono livre na tela (par-ímpar). */
export function polygon2d(xy: ArrayLike<number>, n: number, poly: [number, number][], vis?: Mask): Mask {
  return scan2(xy, n, vis, (x, y) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i] as [number, number];
      const [xj, yj] = poly[j] as [number, number];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}

// ---------------------------------------------------------------- cadeias lineares (costuras)

export interface Chain {
  /** Índices densos em ordem ao longo da cadeia. */
  order: number[];
  /** Cadeia fechada (o último encosta no primeiro). */
  closed: boolean;
}

/**
 * Ordena uma seleção como cadeia linear de pontos adjacentes: sem ramificação, uma só peça conexa, aberta ou
 * fechada. Devolve null se a seleção não é uma cadeia.
 */
export function orderChain(s: PointStore, mask: Mask): Chain | null {
  const idx = maskIndices(mask);
  if (idx.length === 0) return null;
  if (idx.length === 1) return { order: [idx[0] as number], closed: false };
  const adj = new Map<number, number[]>();
  for (const i of idx) {
    const list: number[] = [];
    s.forNeighbors(i, (j) => {
      if (mask[j] && j !== i && !list.includes(j)) list.push(j);
    });
    if (list.length > 2) return null;
    adj.set(i, list);
  }
  const ends = idx.filter((i) => (adj.get(i) as number[]).length <= 1);
  if (ends.length > 2 || ends.some((i) => (adj.get(i) as number[]).length === 0)) return null;
  const closed = ends.length === 0;
  const start = closed
    ? (idx[0] as number)
    : (ends.reduce((a, b) => ((s.seq[a] as number) <= (s.seq[b] as number) ? a : b)) as number);
  const order: number[] = [];
  const seen = new Set<number>();
  let cur: number | undefined = start;
  while (cur !== undefined && !seen.has(cur)) {
    order.push(cur);
    seen.add(cur);
    cur = (adj.get(cur) as number[]).find((j) => !seen.has(j));
  }
  return order.length === idx.length ? { order, closed } : null;
}
