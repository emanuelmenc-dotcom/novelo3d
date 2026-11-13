// SPDX-License-Identifier: GPL-3.0-or-later
// Relaxamento do fio da célula do pb (H1b): colisão, comprimento, periodicidade, determinismo e topologia preservada.
import { mkdirSync, writeFileSync } from "node:fs";
import { hash01 } from "@novelo/core";
import { describe, expect, test } from "vitest";
import {
  cellDiagramSvg,
  cellMinDist,
  pathLength,
  RHO_BANDS,
  relaxCell,
  resample,
  scCellPath,
  segSegDist,
  type V3,
} from "../src/index.ts";

describe("segSegDist", () => {
  test("bate com a força bruta (amostragem densa) em 200 pares aleatórios", () => {
    const pt = (k: number): V3 => [hash01(k) * 2, hash01(k + 1) * 2, hash01(k + 2) * 2];
    for (let n = 0; n < 200; n++) {
      const p0 = pt(n * 12 + 1);
      const p1 = pt(n * 12 + 4);
      const q0 = pt(n * 12 + 7);
      const q1 = pt(n * 12 + 10);
      const got = segSegDist(p0, p1, q0, q1).d;
      let best = Number.POSITIVE_INFINITY;
      const S = 120;
      for (let a = 0; a <= S; a++) {
        const u = a / S;
        const x: V3 = [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, p0[2] + (p1[2] - p0[2]) * u];
        for (let b = 0; b <= S; b++) {
          const t = b / S;
          const y: V3 = [
            q0[0] + (q1[0] - q0[0]) * t,
            q0[1] + (q1[1] - q0[1]) * t,
            q0[2] + (q1[2] - q0[2]) * t,
          ];
          best = Math.min(best, Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]));
        }
      }
      expect(got).toBeLessThanOrEqual(best + 1e-9);
      expect(got).toBeGreaterThan(best - 0.02);
    }
  });
});

describe("relaxCell (pb)", () => {
  const init = resample(scCellPath(), 96, [1, 0, 0]);

  test("ρ = 0,08 (faixa 0) e 0,10 (o maior que cabe): sem interpenetração, fio de mesmo comprimento ou mais curto, periódico", () => {
    for (const rho of [0.08, 0.1]) {
      const r = relaxCell(scCellPath(), { rho });
      expect(r.pts.length).toBe(97);
      // distância mínima entre trechos não adjacentes (inclui as 9 cópias): quase 2ρ
      expect(r.minDist).toBeGreaterThanOrEqual(1.95 * rho);
      // periodicidade exata
      const a = r.pts[0] as V3;
      const b = r.pts[96] as V3;
      expect(b[0] - a[0]).toBeCloseTo(1, 9);
      expect(b[1]).toBeCloseTo(a[1], 9);
      expect(b[2]).toBeCloseTo(a[2], 9);
      // comprimento conservado (ou mais curto)
      expect(pathLength(r.pts)).toBeLessThanOrEqual(pathLength(init) * 1.01);
      // segmentos iguais (±5%)
      const mean = pathLength(r.pts) / 96;
      for (let i = 1; i < r.pts.length; i++) {
        const p = r.pts[i - 1] as V3;
        const q = r.pts[i] as V3;
        expect(Math.abs(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) - mean) / mean).toBeLessThan(0.05);
      }
      // o fio nunca chegou perto de atravessar outro: a topologia do traçado inicial se preserva
      expect(r.minDistEver).toBeGreaterThan(0.05);
      expect(cellMinDist(r.pts)).toBeCloseTo(r.minDist, 9);
    }
  });

  test("determinismo, sem NaN e dentro do orçamento de tempo (3 s por faixa) em todas as faixas", {
    timeout: 60_000,
  }, () => {
    for (let band = 0; band < RHO_BANDS.length; band++) {
      const rho = RHO_BANDS[band] as number;
      const t0 = performance.now();
      const a = relaxCell(scCellPath(), { rho });
      const ms = performance.now() - t0;
      expect(ms).toBeLessThan(3000);
      const b = relaxCell(scCellPath(), { rho });
      expect(a.pts).toEqual(b.pts);
      for (const p of a.pts) expect(p.every(Number.isFinite)).toBe(true);
    }
  });

  test("limite da célula: a partir de ρ ≈ 0,12 (faixa 1) o traçado não cabe sem esticar o fio (documentado, não é falha)", () => {
    const L0 = pathLength(init);
    const r = relaxCell(scCellPath(), { rho: RHO_BANDS[1] as number });
    // não interpenetra de vez (distância mínima > ρ), mas fica abaixo de 2ρ ou estica o fio
    expect(r.minDist).toBeGreaterThan(RHO_BANDS[1] as number);
    expect(r.minDist < 1.95 * (RHO_BANDS[1] as number) || pathLength(r.pts) > L0 * 1.01).toBe(true);
  });

  test("o traçado inicial já respeita o mínimo do plano (folga ≈ 0,09)", () => {
    expect(cellMinDist(init)).toBeGreaterThan(0.08);
  });

  test("diagrama da célula relaxada (NOVELO_DIAGRAMS=1 grava docs/imagens/celula-pb-relaxada.svg)", () => {
    const r = relaxCell(scCellPath(), { rho: 0.1 });
    const svg = cellDiagramSvg(r.pts, 0.1);
    expect(svg.startsWith("<svg")).toBe(true);
    if (process.env.NOVELO_DIAGRAMS) {
      mkdirSync("docs/imagens", { recursive: true });
      writeFileSync("docs/imagens/celula-pb-relaxada.svg", svg);
    }
  });
});
