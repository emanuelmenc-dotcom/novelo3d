// SPDX-License-Identifier: GPL-3.0-or-later
// Referencial de cada ponto e matriz linear que leva o modelo do ponto até o lugar dele na peça (R1).
// Contrato: entrada E_i = meio(P_ant, P_i) e saída X_i = meio(P_i, P_seg) pela ordem de trabalho, logo X_i = E_(i+1) e
// o fio é contínuo por construção. Base B_i = média das posições das bases (ou, sem bases, a média dos filhos refletida).
// Espaço do modelo: x ∈ [-0,5; 0,5] da entrada à saída, y ∈ [-1; 0] da base ao topo, +z para o lado de fora.
// A matriz tem colunas [X-E | C-B | z | C] (cisalhamento: o ponto se ajusta aos vizinhos); sai em ordem de coluna.
import type { V3 } from "./models.ts";

export interface FrameInput {
  /** x, y, z por ponto. */
  positions: ArrayLike<number>;
  /** Bases (índices) de cada ponto. */
  parents: ArrayLike<number>[];
  /** Tamanho relativo de cada ponto (tensão e espessura). */
  size: ArrayLike<number>;
  /** Trechos contínuos do fio (peças): [início, início + quantidade). Sem isso, um só. */
  ranges?: { offset: number; count: number }[];
}

const MIN_AXIS = 0.3;
const MAX_AXIS = 2.5;

const len = (v: V3): number => Math.hypot(v[0], v[1], v[2]);
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Limita o comprimento de um eixo a [0,3; 2,5] vezes o tamanho do ponto, mantendo a direção. */
function clampAxis(v: V3, size: number, fallback: V3): V3 {
  const l = len(v);
  if (l < 1e-6) return mul(fallback, MIN_AXIS * size);
  const k = Math.max(MIN_AXIS * size, Math.min(MAX_AXIS * size, l)) / l;
  return mul(v, k);
}

/** Referencial de cada ponto: entrada E, saída X, base B, centro C e os eixos ex, ey, ez (3 números por ponto). */
export interface FrameSet {
  n: number;
  E: Float32Array;
  X: Float32Array;
  B: Float32Array;
  C: Float32Array;
  ex: Float32Array;
  ey: Float32Array;
  ez: Float32Array;
  /** Tangente unitária do fio na entrada e na saída (a saída de i = a entrada de i+1). */
  tE: Float32Array;
  tX: Float32Array;
  /** Pontos vizinhos no mesmo trecho do fio (-1 se não há). */
  prev: Int32Array;
  next: Int32Array;
}

const newFrames = (n: number): FrameSet => ({
  n,
  E: new Float32Array(n * 3),
  X: new Float32Array(n * 3),
  B: new Float32Array(n * 3),
  C: new Float32Array(n * 3),
  ex: new Float32Array(n * 3),
  ey: new Float32Array(n * 3),
  ez: new Float32Array(n * 3),
  tE: new Float32Array(n * 3),
  tX: new Float32Array(n * 3),
  prev: new Int32Array(n).fill(-1),
  next: new Int32Array(n).fill(-1),
});

/** Referenciais (âncoras de entrada, saída e base, e eixos) e as matrizes por ponto. */
export function computeFrames(input: FrameInput): { frames: FrameSet; matrices: Float32Array } {
  const frames = newFrames(Math.floor(input.positions.length / 3));
  const matrices = computeMatrices(input, frames);
  return { frames, matrices };
}

/** Uma matriz 4x4 (ordem de coluna, como o three) por ponto: 16 números cada. */
export function computeMatrices(input: FrameInput, into?: FrameSet): Float32Array {
  const n = Math.floor(input.positions.length / 3);
  const out = new Float32Array(n * 16);
  const P = (i: number): V3 => [
    input.positions[i * 3] as number,
    input.positions[i * 3 + 1] as number,
    input.positions[i * 3 + 2] as number,
  ];
  // filhos: inverso das bases (CSR)
  const cs = new Int32Array(n + 1);
  for (let i = 0; i < n; i++)
    for (const p of Array.from(input.parents[i] ?? []))
      if (p >= 0 && p < n) cs[p + 1] = (cs[p + 1] as number) + 1;
  for (let i = 0; i < n; i++) cs[i + 1] = (cs[i + 1] as number) + (cs[i] as number);
  const fill = cs.slice(0, n);
  const ch = new Int32Array(cs[n] as number);
  for (let i = 0; i < n; i++) {
    for (const p of Array.from(input.parents[i] ?? [])) {
      if (p >= 0 && p < n) {
        ch[fill[p] as number] = i;
        fill[p] = (fill[p] as number) + 1;
      }
    }
  }
  const ranges = input.ranges && input.ranges.length > 0 ? input.ranges : [{ offset: 0, count: n }];
  for (const { offset, count } of ranges) {
    const lo = offset;
    const hi = Math.min(n, offset + count);
    for (let i = lo; i < hi; i++) {
      const size = (input.size[i] as number) || 1;
      const p = P(i);
      const hasPrev = i > lo;
      const hasNext = i < hi - 1;
      const pp = hasPrev ? P(i - 1) : null;
      const pn = hasNext ? P(i + 1) : null;
      let E: V3;
      let X: V3;
      if (pp && pn) {
        E = mul(add(pp, p), 0.5);
        X = mul(add(p, pn), 0.5);
      } else if (pn) {
        X = mul(add(p, pn), 0.5);
        E = sub(p, mul(sub(pn, p), 0.5));
      } else if (pp) {
        E = mul(add(pp, p), 0.5);
        X = add(p, mul(sub(p, pp), 0.5));
      } else {
        E = [p[0] - 0.5 * size, p[1], p[2]];
        X = [p[0] + 0.5 * size, p[1], p[2]];
      }
      // base: média das bases; sem bases, média dos filhos refletida
      const par = Array.from(input.parents[i] ?? []).filter((q) => q >= 0 && q < n);
      let B: V3;
      if (par.length > 0) {
        const s: V3 = [0, 0, 0];
        for (const q of par) {
          const pq = P(q);
          s[0] += pq[0];
          s[1] += pq[1];
          s[2] += pq[2];
        }
        B = mul(s, 1 / par.length);
      } else if ((cs[i + 1] as number) > (cs[i] as number)) {
        const s: V3 = [0, 0, 0];
        const m = (cs[i + 1] as number) - (cs[i] as number);
        for (let e = cs[i] as number; e < (cs[i + 1] as number); e++) {
          const pc = P(ch[e] as number);
          s[0] += pc[0];
          s[1] += pc[1];
          s[2] += pc[2];
        }
        const mc = mul(s, 1 / m);
        B = sub(p, sub(mc, p));
      } else {
        B = [p[0], p[1], p[2] - size];
      }
      const C = mul(add(E, X), 0.5);
      let ex = clampAxis(sub(X, E), size, [1, 0, 0]);
      let ey = clampAxis(sub(C, B), size, [0, 0, 1]);
      let n3 = cross(ex, ey);
      if (len(n3) < 1e-3 * len(ex) * len(ey)) {
        // eixos paralelos: escolhe um perpendicular qualquer para o ponto não colapsar
        const ref: V3 = Math.abs(ex[0]) < 0.9 * len(ex) ? [1, 0, 0] : [0, 1, 0];
        ey = mul(cross(cross(ex, ref), ex), 1);
        ey = clampAxis(ey, size, [0, 0, 1]);
        ex = clampAxis(ex, size, [1, 0, 0]);
        n3 = cross(ex, ey);
      }
      const zl = len(n3) || 1;
      const ez = mul(n3, ((len(ex) + len(ey)) * 0.5) / zl);
      if (into) {
        // tangentes: média das diferenças centrais dos dois pontos vizinhos da junção (simétrica: tX(i) = tE(i+1))
        const tanAt = (j: number): V3 => {
          const a = P(Math.max(lo, j - 1));
          const b = P(Math.min(hi - 1, j + 1));
          return [(b[0] - a[0]) / 2, (b[1] - a[1]) / 2, (b[2] - a[2]) / 2];
        };
        const junction = (a: number, b: number): V3 => {
          const ta = tanAt(a);
          const tb = tanAt(b);
          const m: V3 = [(ta[0] + tb[0]) / 2, (ta[1] + tb[1]) / 2, (ta[2] + tb[2]) / 2];
          const l = len(m) || 1;
          return [m[0] / l, m[1] / l, m[2] / l];
        };
        const tE = hasPrev
          ? junction(i - 1, i)
          : (() => {
              const t = tanAt(i);
              const l = len(t) || 1;
              return [t[0] / l, t[1] / l, t[2] / l] as V3;
            })();
        const tX = hasNext ? junction(i, i + 1) : tE;
        into.tE.set(tE, i * 3);
        into.tX.set(tX, i * 3);
        into.prev[i] = hasPrev ? i - 1 : -1;
        into.next[i] = hasNext ? i + 1 : -1;
        into.E.set(E, i * 3);
        into.X.set(X, i * 3);
        into.B.set(B, i * 3);
        into.C.set(C, i * 3);
        into.ex.set(ex, i * 3);
        into.ey.set(ey, i * 3);
        into.ez.set(ez, i * 3);
      }
      const o = i * 16;
      out[o] = ex[0];
      out[o + 1] = ex[1];
      out[o + 2] = ex[2];
      out[o + 4] = ey[0];
      out[o + 5] = ey[1];
      out[o + 6] = ey[2];
      out[o + 8] = ez[0];
      out[o + 9] = ez[1];
      out[o + 10] = ez[2];
      out[o + 12] = C[0];
      out[o + 13] = C[1];
      out[o + 14] = C[2];
      out[o + 15] = 1;
    }
  }
  return out;
}

/** Aplica a matriz (ordem de coluna, 16 números a partir de `o`) a um ponto do modelo. */
export function applyMatrix(m: ArrayLike<number>, o: number, v: V3): V3 {
  return [
    (m[o] as number) * v[0] +
      (m[o + 4] as number) * v[1] +
      (m[o + 8] as number) * v[2] +
      (m[o + 12] as number),
    (m[o + 1] as number) * v[0] +
      (m[o + 5] as number) * v[1] +
      (m[o + 9] as number) * v[2] +
      (m[o + 13] as number),
    (m[o + 2] as number) * v[0] +
      (m[o + 6] as number) * v[1] +
      (m[o + 10] as number) * v[2] +
      (m[o + 14] as number),
  ];
}

/** Entrada e saída do ponto no espaço do mundo (para conferir a continuidade do fio). */
export function anchorsOf(m: ArrayLike<number>, i: number): { entry: V3; exit: V3; base: V3 } {
  const o = i * 16;
  return {
    entry: applyMatrix(m, o, [-0.5, 0, 0]),
    exit: applyMatrix(m, o, [0.5, 0, 0]),
    base: applyMatrix(m, o, [0, -1, 0]),
  };
}
