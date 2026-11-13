// SPDX-License-Identifier: GPL-3.0-or-later
// Célula periódica do pb (H1a): traçado, reamostragem e diagrama de nós.
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { cellDiagramSvg, pathLength, resample, scCellPath } from "../src/index.ts";

test("o traçado do pb é periódico em x (último nó = primeiro + (1, 0, 0))", () => {
  const p = scCellPath();
  const a = p[0] as [number, number, number];
  const b = p[p.length - 1] as [number, number, number];
  expect(b[0] - a[0]).toBeCloseTo(1, 12);
  expect(b[1]).toBeCloseTo(a[1], 12);
  expect(b[2]).toBeCloseTo(a[2], 12);
});

test("resample dá m segmentos de mesmo comprimento e mantém os extremos", () => {
  const p = scCellPath();
  const r = resample(p, 96);
  expect(r.length).toBe(97);
  expect(r[0]).toEqual(p[0]);
  expect(r[96]).toEqual(p[p.length - 1]);
  const lens: number[] = [];
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1] as [number, number, number];
    const b = r[i] as [number, number, number];
    lens.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const mean = pathLength(r) / 96;
  for (const l of lens) expect(Math.abs(l - mean) / mean).toBeLessThan(0.15);
});

test("o diagrama de nós é um SVG determinístico com traços e cruzamentos interrompidos", () => {
  const a = cellDiagramSvg(scCellPath(), 0.05);
  const b = cellDiagramSvg(scCellPath(), 0.05);
  expect(a).toBe(b);
  expect(a.startsWith("<svg")).toBe(true);
  expect((a.match(/<line /g) ?? []).length).toBeGreaterThan(900);
  // gera o arquivo para conferência visual: NOVELO_DIAGRAMS=1 npx vitest run packages/stitch3d/test/yarn-cell.test.ts
  if (process.env.NOVELO_DIAGRAMS) {
    mkdirSync("docs/imagens", { recursive: true });
    writeFileSync("docs/imagens/celula-pb.svg", a);
  }
});

test("topologia do traçado: C fura o U de B e as pernas de B passam sob os trilhos da carreira de baixo", () => {
  const p = scCellPath();
  // U de B (nós 8 a 12) no plano x–z, e os dois fios de C que o atravessam em y ≈ -0,17 (nós 22 e 36)
  const u = p.slice(8, 13).map((q) => [q[0], q[2]] as [number, number]);
  const inside = (x: number, z: number): boolean => {
    let c = false;
    for (let i = 0, j = u.length - 1; i < u.length; j = i++) {
      const [xi, zi] = u[i] as [number, number];
      const [xj, zj] = u[j] as [number, number];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const c1 = p[22] as [number, number, number];
  const c2 = p[36] as [number, number, number];
  expect(c1[1]).toBeCloseTo(-0.17, 2);
  expect(c2[1]).toBeCloseTo(-0.17, 2);
  expect(inside(c1[0], c1[2])).toBe(true);
  expect(inside(c2[0], c2[2])).toBe(true);
  // pernas: o ponto mais baixo (y < -1,2) fica abaixo dos trilhos da cópia de baixo (y ≈ 0 - 1 = -1)
  const legs = [p[3], p[17]] as [number, number, number][];
  for (const q of legs) expect(q[1]).toBeLessThan(-1.2);
});
