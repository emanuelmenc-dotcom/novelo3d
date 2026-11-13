// SPDX-License-Identifier: GPL-3.0-or-later
// Forma do ponto de base (R3d): quando o ponto seguinte é trabalhado sobre um ponto, o topo dele abre e se inclina na
// direção dos filhos (1 filho, aumento, diminuição). Deriva só da topologia e dos quadros: nada é gravado nem desfeito.
// Só aparece no Render; o 3D de edição continua com o modelo neutro.
import { deformPoint } from "./deform.ts";
import type { FrameSet } from "./frames.ts";
import { centerlines, type Line, type ModelSpec, NEUTRAL, type TopShape, type V3 } from "./models.ts";

export { isNeutral, NEUTRAL, type TopShape } from "./models.ts";

const MAX_LEAN_X = 0.25;
const MAX_LEAN_Z = 0.15;
const STEP = 0.05;

const snap = (v: number, lim: number): number => {
  const c = Math.max(-lim, Math.min(lim, v));
  const q = Math.round(c / STEP) * STEP;
  return Object.is(q, -0) ? 0 : Number(q.toFixed(2));
};

const axis = (a: Float32Array, i: number): V3 => [
  a[i * 3] as number,
  a[i * 3 + 1] as number,
  a[i * 3 + 2] as number,
];

export interface TopShapeInput {
  frames: FrameSet;
  /** Bases (índices) de cada ponto, na ordem das pernas. */
  parents: ArrayLike<number>[];
  /** Pernas do modelo de cada ponto. */
  legs: ArrayLike<number>;
  /** Só contam filhos com índice ≤ upTo (padrão: todos). */
  upTo?: number;
}

/** Filhos de cada ponto (um índice por ligação, em ordem crescente do filho). */
export function childrenOf(parents: ArrayLike<number>[], n: number): number[][] {
  const out: number[][] = Array.from({ length: n }, () => []);
  for (let c = 0; c < n; c++) {
    const ps = parents[c];
    if (!ps) continue;
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k] as number;
      if (p >= 0 && p < n && p !== c) (out[p] as number[]).push(c);
    }
  }
  return out;
}

/** Forma do topo do ponto `p` com os filhos de índice ≤ `upTo` (o centro de cada filho é para onde o topo se inclina). */
export function topShapeAt(frames: FrameSet, children: number[][], p: number, upTo: number): TopShape {
  const fs: V3[] = [];
  for (const c of children[p] ?? []) {
    if (c > upTo) break;
    fs.push([frames.C[c * 3] as number, frames.C[c * 3 + 1] as number, frames.C[c * 3 + 2] as number]);
  }
  if (fs.length === 0) return NEUTRAL;
  const mean: V3 = [0, 0, 0];
  for (const f of fs)
    for (let t = 0; t < 3; t++) mean[t] = (mean[t] as number) + (f[t] as number) / fs.length;
  const top = deformPoint(frames, p, [0, 0, 0]);
  const d: V3 = [mean[0] - top[0], mean[1] - top[1], mean[2] - top[2]];
  const ex = axis(frames.ex, p);
  const ez = axis(frames.ez, p);
  const lx = ex[0] * ex[0] + ex[1] * ex[1] + ex[2] * ex[2] || 1;
  const lz = ez[0] * ez[0] + ez[1] * ez[1] + ez[2] * ez[2] || 1;
  // coordenada de d nos eixos do ponto, em unidades do modelo
  const leanX = (d[0] * ex[0] + d[1] * ex[1] + d[2] * ex[2]) / lx;
  const leanZ = (d[0] * ez[0] + d[1] * ez[1] + d[2] * ez[2]) / lz;
  return {
    open: fs.length >= 2 ? 2 : 1,
    leanX: Number.isFinite(leanX) ? snap(leanX, MAX_LEAN_X) : 0,
    leanZ: Number.isFinite(leanZ) ? snap(leanZ, MAX_LEAN_Z) : 0,
  };
}

/** Forma do topo de cada ponto a partir dos filhos que já existem. */
export function topShapes(i: TopShapeInput): TopShape[] {
  const n = i.frames.n;
  const last = i.upTo ?? n - 1;
  const children = childrenOf(i.parents, n);
  return Array.from({ length: n }, (_, p) => topShapeAt(i.frames, children, p, last));
}

/** Linhas centrais do modelo com a forma do topo aplicada (o neutro dá as mesmas linhas de `centerlines`). */
export const shapedCenterlines = (spec: ModelSpec, s: TopShape): Line[] => centerlines(spec, s);

export const shapeKey = (s: TopShape): string => `${s.open}:${s.leanX}:${s.leanZ}`;
