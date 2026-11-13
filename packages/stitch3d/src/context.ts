// SPDX-License-Identifier: GPL-3.0-or-later
// Hash de contexto por ponto (R3d): identifica "com que vizinhança" um ponto foi simulado. Sem posições: só tipo/variante,
// tamanho e uid do ponto e dos vizinhos a 1 salto, mais os parâmetros da simulação. Mudou o hash = o ponto está "sujo".

export const SIM_VERSION = 1;

export interface ContextInput {
  /** Chave numérica estável do tipo/variante de cada ponto. */
  keys: ArrayLike<number>;
  size: ArrayLike<number>;
  uids: ArrayLike<number>;
  /** Pares a, b (arestas do layout: sai de e ao lado de). */
  edges: ArrayLike<number>;
  /** Parâmetros da simulação (iterações, bases, colisão...), na ordem fixa que o chamador escolher. */
  params: ArrayLike<number>;
}

const PRIME = 0x01000193;
function mix(h: number, v: number): number {
  let x = v | 0;
  let out = h;
  for (let i = 0; i < 4; i++) {
    out ^= x & 0xff;
    out = Math.imul(out, PRIME);
    x >>>= 8;
  }
  return out;
}

export function contextHashes(i: ContextInput): Int32Array {
  const n = i.uids.length;
  const near: number[][] = Array.from({ length: n }, () => []);
  for (let e = 0; e + 1 < i.edges.length; e += 2) {
    const a = i.edges[e] as number;
    const b = i.edges[e + 1] as number;
    if (a >= 0 && a < n && b >= 0 && b < n && a !== b) {
      (near[a] as number[]).push(b);
      (near[b] as number[]).push(a);
    }
  }
  let seed = 0x811c9dc5;
  seed = mix(seed, SIM_VERSION);
  for (let k = 0; k < i.params.length; k++) seed = mix(seed, Math.round((i.params[k] as number) * 1000));
  const tuple = (h: number, p: number): number => {
    const a = mix(h, i.uids[p] as number);
    const b = mix(a, i.keys[p] as number);
    return mix(b, Math.round((i.size[p] as number) * 100));
  };
  const out = new Int32Array(n);
  for (let p = 0; p < n; p++) {
    let h = tuple(seed, p);
    // vizinhos em ordem de uid, para não depender da ordem das arestas
    const nb = [...new Set(near[p] as number[])].sort(
      (a, b) => (i.uids[a] as number) - (i.uids[b] as number),
    );
    h = mix(h, nb.length);
    for (const q of nb) h = tuple(h, q);
    out[p] = h | 0;
  }
  return out;
}
