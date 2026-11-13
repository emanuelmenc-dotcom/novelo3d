// SPDX-License-Identifier: GPL-3.0-or-later
// Modelo relaxado do pb no render (H2): célula por raio, deformação larga e fio contínuo entre pontos vizinhos.
import { describe, expect, test } from "vitest";
import {
  computeFrames,
  deformPointWide,
  deformToCurve,
  type ModelSpec,
  RELAXED_MAX_RHO,
  relaxedScCell,
  segSegDist,
  type V3,
} from "../src/index.ts";

const SC: ModelSpec = { type: "SC", version: 1, legs: 1, band: 2, mirror: false, tension: 4, quality: 1 };

/** Fiada plana: base de 12 pontos em (i, 0, 0) e fiada de 12 pb em (i, 1, 0), cada pb sobre o ponto de baixo. */
function flatRow() {
  const N = 12;
  const positions: number[] = [];
  const parents: number[][] = [];
  for (let i = 0; i < N; i++) {
    positions.push(i, 0, 0);
    parents.push([]);
  }
  for (let i = 0; i < N; i++) {
    positions.push(i, 1, 0);
    parents.push([i]);
  }
  const { frames } = computeFrames({
    positions,
    parents,
    size: new Array(2 * N).fill(1),
    ranges: [
      { offset: 0, count: N },
      { offset: N, count: N },
    ],
  });
  return { N, frames };
}

describe("relaxedScCell", () => {
  test("uma célula por raio (cache) e recusa raio acima do limite testado", () => {
    const a = relaxedScCell(0.1);
    expect(a).not.toBeNull();
    expect(relaxedScCell(0.1)).toBe(a);
    expect(relaxedScCell(RELAXED_MAX_RHO + 0.01)).toBeNull();
    expect(relaxedScCell(0)).toBeNull();
  });
});

describe("deformPointWide em fiada plana", () => {
  const rho = 0.1;
  const cell = relaxedScCell(rho) as V3[];
  const { N, frames } = flatRow();
  const strand = (i: number): V3[] => cell.map((p) => deformPointWide(frames, N + i, p));

  test("o fim do fio de um ponto coincide com o início do fio do seguinte", () => {
    for (let i = 2; i < 9; i++) {
      const a = strand(i)[96] as V3;
      const b = strand(i + 1)[0] as V3;
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(1e-6);
    }
  });

  test("fios de pontos diferentes ficam a pelo menos 1,7ρ (fora da junção)", () => {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 2; i < 8; i++) {
      for (let j = i + 1; j <= i + 3; j++) {
        const A = strand(i);
        const B = strand(j);
        for (let p = 0; p < 96; p++) {
          for (let q = 0; q < 96; q++) {
            // vizinhos que se encontram na junção: pontas do fio de i com o começo do fio de j
            if (j === i + 1 && p > 88 && q < 8) continue;
            const d = segSegDist(A[p] as V3, A[p + 1] as V3, B[q] as V3, B[q + 1] as V3).d;
            if (d < best) best = d;
          }
        }
      }
    }
    expect(best).toBeGreaterThanOrEqual(1.7 * rho);
  });

  test("deformToCurve com a célula gera a malha do fio contínuo e muda com o modelo", () => {
    const i = N + 4;
    const simple = deformToCurve(SC, frames, i, rho);
    const relaxed = deformToCurve(SC, frames, i, rho, undefined, { cell });
    expect(relaxed.triangles).toBeGreaterThan(0);
    expect(relaxed.positions.length).not.toBe(simple.positions.length);
    // qualidade 0 (edição) e tipos que não são pb ignoram a célula
    const edit = deformToCurve({ ...SC, quality: 0 }, frames, i, rho, undefined, { cell });
    expect(edit.positions.length).toBe(deformToCurve({ ...SC, quality: 0 }, frames, i, rho).positions.length);
    const dc = deformToCurve({ ...SC, type: "DC" }, frames, i, rho, undefined, { cell });
    expect(dc.positions.length).toBe(deformToCurve({ ...SC, type: "DC" }, frames, i, rho).positions.length);
  });
});
