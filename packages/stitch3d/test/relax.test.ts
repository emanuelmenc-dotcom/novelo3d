// SPDX-License-Identifier: GPL-3.0-or-later
// Relaxamento de espaçamento da seleção (R3c).
import { hash01 } from "@novelo/core";
import { expect, test } from "vitest";
import { relaxSelection } from "../src/index.ts";

/** Grade w×h de pontos com espaçamento 1 no plano z=0, arestas horizontais e verticais. */
function grid(w: number, h: number, jitter = 0, seed = 1) {
  const positions: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      positions.push(
        x + (hash01(seed * 1000 + i * 3) - 0.5) * jitter,
        y + (hash01(seed * 1000 + i * 3 + 1) - 0.5) * jitter,
        (hash01(seed * 1000 + i * 3 + 2) - 0.5) * jitter,
      );
    }
  }
  const edges: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x + 1 < w) edges.push(y * w + x, y * w + x + 1);
      if (y + 1 < h) edges.push(y * w + x, (y + 1) * w + x);
    }
  }
  return { positions, edges, size: new Array(w * h).fill(1) };
}
const center = (w: number, h: number) => {
  const free: number[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) free.push(y * w + x);
  return free;
};

test("pontos fora da seleção saem idênticos", () => {
  const g = grid(6, 6, 0.4);
  const free = center(6, 6);
  const r = relaxSelection({ ...g, free });
  const freeSet = new Set(free);
  for (let p = 0; p < 36; p++) {
    if (freeSet.has(p)) continue;
    for (let c = 0; c < 3; c++) expect(r.positions[p * 3 + c]).toBe(g.positions[p * 3 + c]);
  }
});

test("zero iterações é identidade e não muda a entrada", () => {
  const g = grid(5, 5, 0.4);
  const copy = [...g.positions];
  const r = relaxSelection({ ...g, free: center(5, 5), iterations: 0 });
  expect([...r.positions]).toEqual(copy);
  expect(g.positions).toEqual(copy);
  expect(r.stats.iterations).toBe(0);
});

test("determinismo: duas chamadas iguais dão o mesmo resultado", () => {
  const g = grid(7, 7, 0.5, 3);
  const a = relaxSelection({ ...g, free: center(7, 7) });
  const b = relaxSelection({ ...g, free: center(7, 7) });
  expect([...a.positions]).toEqual([...b.positions]);
});

test("grade perturbada: o resíduo cai e o deslocamento respeita o limite", () => {
  const g = grid(8, 8, 0.5, 5);
  const r = relaxSelection({ ...g, free: center(8, 8), iterations: 40 });
  expect(r.stats.residualAfter).toBeLessThan(r.stats.residualBefore);
  expect(r.stats.iterations).toBeGreaterThan(0);
  // k ≈ 1 e size = 1: limite = 0,5 · k · 1, com folga para o k medido
  expect(r.stats.maxShift).toBeLessThanOrEqual(0.5 * 1.2);
});

test("grade já no alvo não se move", () => {
  const g = grid(6, 6, 0);
  const r = relaxSelection({ ...g, free: center(6, 6) });
  for (let i = 0; i < g.positions.length; i++)
    expect(r.positions[i]).toBeCloseTo(g.positions[i] as number, 9);
  expect(r.stats.maxShift).toBeLessThan(1e-9);
});

test("seleção vazia, índices inválidos e arestas degeneradas não quebram", () => {
  const g = grid(4, 4, 0.3);
  expect(relaxSelection({ ...g, free: [] }).stats.free).toBe(0);
  const r = relaxSelection({ ...g, free: [-1, 999, 5.5, 5], edges: [...g.edges, 3, 3, 2, 2] });
  expect(r.stats.free).toBe(1);
  expect(r.positions.every(Number.isFinite)).toBe(true);
  const same = relaxSelection({ positions: [0, 0, 0, 0, 0, 0], edges: [0, 1], size: [1, 1], free: [0, 1] });
  expect(same.positions.every(Number.isFinite)).toBe(true);
});

test("propriedade: 30 grades aleatórias sem NaN, resíduo não sobe e deslocamento limitado", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const w = 3 + (seed % 5);
    const h = 3 + ((seed * 7) % 5);
    const g = grid(w, h, 0.8, seed);
    const r = relaxSelection({ ...g, free: center(w, h), iterations: 1 + (seed % 50) });
    expect(r.positions.every(Number.isFinite)).toBe(true);
    expect(r.stats.residualAfter).toBeLessThanOrEqual(r.stats.residualBefore + 1e-12);
    expect(r.stats.maxShift).toBeLessThanOrEqual(0.5 * 1.6);
  }
});

test("passo reduzido: a grade perturbada continua melhorando depois da 1ª iteração", () => {
  const g = grid(8, 8, 0.5, 5);
  const one = relaxSelection({ ...g, free: center(8, 8), iterations: 1 });
  const many = relaxSelection({ ...g, free: center(8, 8), iterations: 40 });
  expect(many.stats.iterations).toBeGreaterThan(3);
  expect(many.stats.residualAfter).toBeLessThan(one.stats.residualAfter);
});
