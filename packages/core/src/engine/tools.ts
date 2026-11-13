// SPDX-License-Identifier: GPL-3.0-or-later
// Ferramentas de edição por máscara (docs/15): pincel, balde, listras, gradiente e suavização.
// Todas devolvem máscaras ou valores por ponto; quem grava nas colunas/sobreposições é o chamador.
import { type Mask, neighborhood, newMask } from "./select.ts";
import type { PointStore } from "./store.ts";

/** Pincel: o ponto e todos até `hops` saltos de distância (limitado ao alvo, se houver). */
export const brushMask = (s: PointStore, center: number, hops: number, target?: Mask): Mask =>
  neighborhood(s, center, Math.max(0, hops), target);

/** Balde: região contígua a partir de `seed` onde a coluna tem o mesmo valor que no ponto inicial. */
export function bucketMask(s: PointStore, seed: number, prop: string, target?: Mask): Mask {
  const m = newMask(s.n);
  if (seed < 0 || seed >= s.n || (target && !target[seed])) return m;
  const col = s.col(prop);
  const val = col[seed] as number;
  const q = new Int32Array(s.n);
  let h = 0;
  let t = 0;
  m[seed] = 1;
  q[t++] = seed;
  while (h < t) {
    const u = q[h++] as number;
    s.forNeighbors(u, (v) => {
      if (m[v] || col[v] !== val || (target && !target[v])) return;
      m[v] = 1;
      q[t++] = v;
    });
  }
  return m;
}

/**
 * Listras repetidas por grupo (volta): `pattern` = [[fio, nº de voltas], ...]; ex.: [[0,2],[1,1]] = 2A/1B.
 * Devolve o fio de cada ponto da máscara (-1 fora dela). Grupos contam a partir do primeiro grupo da máscara.
 */
export function stripes(s: PointStore, pattern: [number, number][], target: Mask): Int16Array {
  const out = new Int16Array(s.n).fill(-1);
  const total = pattern.reduce((a, [, n]) => a + Math.max(1, n), 0);
  if (total === 0) return out;
  let g0 = Number.POSITIVE_INFINITY;
  for (let i = 0; i < s.n; i++) if (target[i] && (s.group[i] as number) < g0) g0 = s.group[i] as number;
  for (let i = 0; i < s.n; i++) {
    if (!target[i]) continue;
    let k = ((s.group[i] as number) - g0) % total;
    let yarn = pattern[0]?.[0] ?? 0;
    for (const [y, n] of pattern) {
      const len = Math.max(1, n);
      if (k < len) {
        yarn = y;
        break;
      }
      k -= len;
    }
    out[i] = yarn;
  }
  return out;
}

/** Gradiente linear ao longo da ordem de trabalho entre o primeiro e o último ponto da máscara. */
export function gradientBySeq(s: PointStore, target: Mask, from: number, to: number): Float32Array {
  const out = new Float32Array(s.n);
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < s.n; i++) {
    if (!target[i]) continue;
    lo = Math.min(lo, s.seq[i] as number);
    hi = Math.max(hi, s.seq[i] as number);
  }
  const span = hi - lo || 1;
  for (let i = 0; i < s.n; i++) {
    if (target[i]) out[i] = from + ((to - from) * ((s.seq[i] as number) - lo)) / span;
  }
  return out;
}

/** Suavização: cada ponto do alvo vira a média dele com os vizinhos (`passes` vezes). */
export function smooth(s: PointStore, prop: string, target: Mask, passes = 1): Float32Array {
  let cur = Float32Array.from(s.col(prop));
  for (let p = 0; p < passes; p++) {
    const next = Float32Array.from(cur);
    for (let i = 0; i < s.n; i++) {
      if (!target[i]) continue;
      let sum = cur[i] as number;
      let c = 1;
      s.forNeighbors(i, (j) => {
        sum += cur[j] as number;
        c++;
      });
      next[i] = sum / c;
    }
    cur = next;
  }
  return cur;
}
