// SPDX-License-Identifier: GPL-3.0-or-later
// Nível de detalhe "tubo": o fio contínuo por todos os pontos, na ordem de trabalho, como um tubo de seção quadrada
// (8 triângulos por ponto, uma malha só). Usado em peças muito grandes ou com a câmera longe.
import type { MeshData } from "./models.ts";

export interface TubeLod extends Omit<MeshData, "normals" | "param"> {
  /** Ponto (índice) de cada vértice, para colorir o tubo pela cor de cada ponto. */
  vertexNode: Uint32Array;
}

/** Tubo pelos pontos de cada trecho contínuo (peça). Raio em unidades de largura de ponto, escalado pelo tamanho. */
export function buildTubeLod(
  positions: ArrayLike<number>,
  size: ArrayLike<number>,
  rho: number,
  ranges?: { offset: number; count: number }[],
): TubeLod {
  const n = Math.floor(positions.length / 3);
  const rs = ranges && ranges.length > 0 ? ranges : [{ offset: 0, count: n }];
  const pos: number[] = [];
  const idx: number[] = [];
  const node: number[] = [];
  for (const { offset, count } of rs) {
    const lo = offset;
    const hi = Math.min(n, offset + count);
    if (hi - lo < 2) continue;
    const base = pos.length / 3;
    for (let i = lo; i < hi; i++) {
      const p = [positions[i * 3] as number, positions[i * 3 + 1] as number, positions[i * 3 + 2] as number];
      const a = i > lo ? i - 1 : i;
      const b = i < hi - 1 ? i + 1 : i;
      let t = [
        (positions[b * 3] as number) - (positions[a * 3] as number),
        (positions[b * 3 + 1] as number) - (positions[a * 3 + 1] as number),
        (positions[b * 3 + 2] as number) - (positions[a * 3 + 2] as number),
      ];
      const tl = Math.hypot(t[0] as number, t[1] as number, t[2] as number) || 1;
      t = t.map((v) => (v as number) / tl);
      const up = Math.abs(t[2] as number) > 0.9 ? [1, 0, 0] : [0, 0, 1];
      let n1 = [
        (t[1] as number) * (up[2] as number) - (t[2] as number) * (up[1] as number),
        (t[2] as number) * (up[0] as number) - (t[0] as number) * (up[2] as number),
        (t[0] as number) * (up[1] as number) - (t[1] as number) * (up[0] as number),
      ];
      const nl = Math.hypot(n1[0] as number, n1[1] as number, n1[2] as number) || 1;
      n1 = n1.map((v) => (v as number) / nl);
      const n2 = [
        (t[1] as number) * (n1[2] as number) - (t[2] as number) * (n1[1] as number),
        (t[2] as number) * (n1[0] as number) - (t[0] as number) * (n1[2] as number),
        (t[0] as number) * (n1[1] as number) - (t[1] as number) * (n1[0] as number),
      ];
      const r = rho * ((size[i] as number) || 1);
      for (const [u, v] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        pos.push(
          (p[0] as number) + r * (u * (n1[0] as number) + v * (n2[0] as number)),
          (p[1] as number) + r * (u * (n1[1] as number) + v * (n2[1] as number)),
          (p[2] as number) + r * (u * (n1[2] as number) + v * (n2[2] as number)),
        );
        node.push(i);
      }
    }
    for (let i = 0; i < hi - lo - 1; i++) {
      const a = base + i * 4;
      const b = a + 4;
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        idx.push(a + k, a + k2, b + k, a + k2, b + k2, b + k);
      }
    }
  }
  const vertices = pos.length / 3;
  const Index = vertices > 65535 ? Uint32Array : Uint16Array;
  return {
    positions: Float32Array.from(pos),
    // índices de 32 bits só quando necessário (peças grandes)
    indices: Index.from(idx),
    triangles: idx.length / 3,
    vertexNode: Uint32Array.from(node),
  };
}
