// SPDX-License-Identifier: GPL-3.0-or-later
// Deslocamentos no quadro do ponto (R3d): a simulação guarda (a, b, c) nos eixos unitários ex, ey, ez de cada ponto, em
// unidades de k·tamanho, e não xyz absolutos; assim o resultado sobrevive a mudanças do layout (tensão, rotação). Puro.
import type { FrameSet } from "./frames.ts";

type V3 = [number, number, number];

function basis(f: FrameSet, i: number): [V3, V3, V3] {
  const u = (a: Float32Array): V3 => {
    const x = a[i * 3] as number;
    const y = a[i * 3 + 1] as number;
    const z = a[i * 3 + 2] as number;
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  };
  return [u(f.ex), u(f.ey), u(f.ez)];
}

/** Resolve d = a·u + b·v + c·w (regra de Cramer); null se u, v, w forem coplanares. */
function solver(u: V3, v: V3, w: V3): ((d: V3) => V3) | null {
  const det3 = (p: V3, q: V3, r: V3): number =>
    p[0] * (q[1] * r[2] - q[2] * r[1]) -
    q[0] * (p[1] * r[2] - p[2] * r[1]) +
    r[0] * (p[1] * q[2] - p[2] * q[1]);
  const det = det3(u, v, w);
  if (Math.abs(det) < 1e-9) return null;
  return (d) => [det3(d, v, w) / det, det3(u, d, w) / det, det3(u, v, d) / det];
}

/** (a, b, c) por ponto: `final - base` escrito nos eixos unitários do ponto, dividido por k·tamanho. */
export function toFrameOffsets(
  base: ArrayLike<number>,
  final: ArrayLike<number>,
  frames: FrameSet,
  size: ArrayLike<number>,
  k: number,
): Float64Array {
  const n = Math.floor(base.length / 3);
  const out = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d: V3 = [
      (final[i * 3] as number) - (base[i * 3] as number),
      (final[i * 3 + 1] as number) - (base[i * 3 + 1] as number),
      (final[i * 3 + 2] as number) - (base[i * 3 + 2] as number),
    ];
    if (d[0] === 0 && d[1] === 0 && d[2] === 0) continue;
    const [u, v, w] = basis(frames, i);
    const s = solver(u, v, w);
    if (!s) continue;
    const unit = k * ((size[i] as number) || 1);
    const [a, b, c] = s(d);
    out[i * 3] = a / unit;
    out[i * 3 + 1] = b / unit;
    out[i * 3 + 2] = c / unit;
  }
  return out;
}

/** Posições = base + deslocamentos (a, b, c por ponto) escritos de volta nos eixos do ponto. */
export function applyFrameOffsets(
  base: ArrayLike<number>,
  offsets: ArrayLike<number>,
  frames: FrameSet,
  size: ArrayLike<number>,
  k: number,
): Float64Array {
  const n = Math.floor(base.length / 3);
  const out = Float64Array.from(base as ArrayLike<number>);
  for (let i = 0; i < n; i++) {
    const a = offsets[i * 3] as number;
    const b = offsets[i * 3 + 1] as number;
    const c = offsets[i * 3 + 2] as number;
    if (!a && !b && !c) continue;
    const [u, v, w] = basis(frames, i);
    const unit = k * ((size[i] as number) || 1);
    for (let t = 0; t < 3; t++) {
      out[i * 3 + t] =
        (out[i * 3 + t] as number) +
        ((u[t] as number) * a + (v[t] as number) * b + (w[t] as number) * c) * unit;
    }
  }
  return out;
}
