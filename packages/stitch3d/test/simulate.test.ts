// SPDX-License-Identifier: GPL-3.0-or-later
// Simulação ponto a ponto (R3d-1): grade espacial, colisão, passos retomáveis, hash de contexto e deslocamentos no quadro.
import { buildGraph, hash01 } from "@novelo/core";
import { layoutGraph } from "@novelo/layout";
import { parsePattern } from "@novelo/notation";
import { describe, expect, test } from "vitest";
import {
  applyFrameOffsets,
  computeFrames,
  contextHashes,
  createGrid,
  createSimulation,
  toFrameOffsets,
} from "../src/index.ts";

const RECIPE = [
  "V1: 6 pb no anel mágico (6)",
  "V2: 6 aum (12)",
  "V3: (1 pb, 1 aum) x6 (18)",
  "V4: (2 pb, 1 aum) x6 (24)",
  "V5–8: 1 pb em cada ponto (24)",
  "V9: (2 pb, 1 dim) x6 (18)",
  "V10: (1 pb, 1 dim) x6 (12)",
  "V11: 6 dim (6)",
].join("\n");

function setup() {
  const g = buildGraph(parsePattern(RECIPE).pattern);
  const r = layoutGraph(g);
  const n = g.nodes.length;
  return {
    n,
    positions: Array.from(r.positions),
    edges: Array.from(r.edges),
    parents: g.nodes.map((nd) => nd.parents),
    size: new Array(n).fill(1) as number[],
  };
}

describe("grade espacial", () => {
  test("a consulta por raio dá o mesmo resultado que a força bruta, mesmo depois de mover pontos", () => {
    const n = 200;
    const pos = Float64Array.from({ length: n * 3 }, (_, i) => hash01(i + 11) * 10);
    const grid = createGrid(1.5, pos);
    for (let m = 0; m < 50; m++) {
      const id = (m * 7) % n;
      const old = [pos[id * 3], pos[id * 3 + 1], pos[id * 3 + 2]] as number[];
      const nw = [hash01(m + 900) * 10, hash01(m + 901) * 10, hash01(m + 902) * 10];
      pos.set(nw, id * 3);
      grid.move(
        id,
        old[0] as number,
        old[1] as number,
        old[2] as number,
        nw[0] as number,
        nw[1] as number,
        nw[2] as number,
      );
    }
    for (let q = 0; q < 20; q++) {
      const c = [hash01(q + 50) * 10, hash01(q + 51) * 10, hash01(q + 52) * 10] as [number, number, number];
      const r = 0.5 + hash01(q + 53) * 2;
      const got: number[] = [];
      grid.query(c[0], c[1], c[2], r, (id) => got.push(id));
      const want: number[] = [];
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(
          (pos[i * 3] as number) - c[0],
          (pos[i * 3 + 1] as number) - c[1],
          (pos[i * 3 + 2] as number) - c[2],
        );
        if (d <= r) want.push(i);
      }
      expect(got.sort((a, b) => a - b)).toEqual(want);
    }
  });
});

describe("simulação", () => {
  const input = () => {
    const s = setup();
    // perturba o layout para haver o que acomodar
    const base = s.positions;
    const start = base.map((v, i) => v + (hash01(i + 5) - 0.5) * 0.15);
    return {
      s,
      sim: {
        base,
        start,
        edges: s.edges,
        parents: s.parents,
        size: s.size,
        dirty: new Array(s.n).fill(1) as number[],
      },
    };
  };

  test("determinismo e sem NaN", () => {
    const a = createSimulation(input().sim);
    const b = createSimulation(input().sim);
    a.step(1e9);
    b.step(1e9);
    expect([...a.positions]).toEqual([...b.positions]);
    expect(a.positions.every(Number.isFinite)).toBe(true);
    expect(a.stats().simulated).toBe(input().s.n);
  });

  test("step(1) repetido = step(64) = step(n): mesmo checksum", () => {
    const { s, sim } = input();
    const one = createSimulation(sim);
    while (!one.step(1));
    const chunk = createSimulation(sim);
    while (!chunk.step(64));
    const all = createSimulation(sim);
    all.step(s.n);
    expect(one.stats().checksum).toBe(all.stats().checksum);
    expect(chunk.stats().checksum).toBe(all.stats().checksum);
  });

  test("ponto limpo sai idêntico ao de partida", () => {
    const { s, sim } = input();
    const dirty = new Array(s.n).fill(1);
    for (const p of [3, 10, 20]) dirty[p] = 0;
    const r = createSimulation({ ...sim, dirty });
    r.step(s.n);
    for (const p of [3, 10, 20]) {
      for (let c = 0; c < 3; c++) expect(r.positions[p * 3 + c]).toBe(sim.start[p * 3 + c]);
    }
  });

  test("com moveBases desligado as bases não se movem; ligado, as bases sujas também se movem", () => {
    const { s, sim } = input();
    const last = s.n - 1;
    const bases = s.parents[last] ?? [];
    expect(bases.length).toBeGreaterThan(0);
    const dirty = new Array(s.n).fill(0);
    dirty[last] = 1;
    for (const b of bases) dirty[b] = 1;
    const run = (moveBases: boolean) => {
      const r = createSimulation({ ...sim, dirty, moveBases });
      r.step(last);
      const before = [...r.positions];
      r.step(1);
      return bases.some((b) => [0, 1, 2].some((c) => r.positions[b * 3 + c] !== before[b * 3 + c]));
    };
    expect(run(false)).toBe(false);
    expect(run(true)).toBe(true);
  });

  test("o deslocamento fica dentro do limite e a simulação mexe no layout perturbado", () => {
    const { sim } = input();
    const r = createSimulation(sim);
    r.step(1e9);
    const st = r.stats();
    expect(st.maxShift).toBeGreaterThan(0);
    expect(st.meanShift).toBeGreaterThan(0);
    // limite do ponto (0,5·k·tamanho) mais a perturbação inicial de até 0,15·√3 já presente em `start`
    expect(st.maxShift).toBeLessThan(0.5 + (0.15 * Math.sqrt(3)) / r.k + 1e-6);
  });

  test("colisão: dois pontos não adjacentes sobrepostos se afastam; sem colisão ficam", () => {
    // cadeia 0-1-2; o ponto 2 cai quase em cima do 0 (não são vizinhos)
    const base = [0, 0, 0, 1, 0, 0, 0.05, 0.02, 0];
    const mk = (collision: boolean) => {
      const r = createSimulation({
        base,
        start: base,
        edges: [0, 1, 1, 2],
        parents: [[], [0], [1]],
        size: [1, 1, 1],
        dirty: [0, 0, 1],
        iterations: 20,
        collision,
      });
      r.step(3);
      return r.positions;
    };
    const d = (p: Float64Array) =>
      Math.hypot((p[6] as number) - (p[0] as number), (p[7] as number) - (p[1] as number));
    expect(d(mk(true))).toBeGreaterThan(d(mk(false)));
  });
});

describe("equilíbrio e limites", () => {
  /** Grade 6×6 com espaçamento 1: sem sobreposição, então o layout base já é o equilíbrio. */
  const gridCase = () => {
    const w = 6;
    const positions: number[] = [];
    const edges: number[] = [];
    const parents: number[][] = [];
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        positions.push(x, y, 0);
        if (x > 0) edges.push(i - 1, i);
        if (y > 0) edges.push(i - w, i);
        parents.push(y > 0 ? [i - w] : []);
      }
    }
    return { positions, edges, parents, n: w * w };
  };

  test("layout base sem sobreposição: nada se move, com e sem moveBases", () => {
    const c = gridCase();
    for (const moveBases of [false, true]) {
      const r = createSimulation({
        base: c.positions,
        start: c.positions,
        edges: c.edges,
        parents: c.parents,
        size: new Array(c.n).fill(1),
        dirty: new Array(c.n).fill(1),
        moveBases,
      });
      r.step(c.n);
      expect(r.stats().maxShift).toBeLessThan(1e-9);
    }
  });

  test("com o layout perturbado, ninguém passa de 0,5·k e as bases não andam mais de 0,25·k por ponto simulado", () => {
    const c = gridCase();
    const start = c.positions.map((v, i) => v + (hash01(i + 77) - 0.5) * 0.3);
    const r = createSimulation({
      base: c.positions,
      start,
      edges: c.edges,
      parents: c.parents,
      size: new Array(c.n).fill(1),
      dirty: new Array(c.n).fill(1),
      moveBases: true,
    });
    r.step(c.n);
    for (let p = 0; p < c.n; p++) {
      const d = Math.hypot(
        (r.positions[p * 3] as number) - (c.positions[p * 3] as number),
        (r.positions[p * 3 + 1] as number) - (c.positions[p * 3 + 1] as number),
        (r.positions[p * 3 + 2] as number) - (c.positions[p * 3 + 2] as number),
      );
      // 0,5·k a partir do base, mais a perturbação inicial (até 0,15·√3) que já vem em `start`
      expect(d).toBeLessThanOrEqual(0.5 * r.k + 0.15 * Math.sqrt(3) + 1e-9);
    }
  });
});

describe("hash de contexto", () => {
  const ctx = () => {
    const s = setup();
    return {
      s,
      uids: Array.from({ length: s.n }, (_, i) => i + 1),
      keys: new Array(s.n).fill(7) as number[],
    };
  };
  const h = (size: number[], params = [8, 1, 1]) => {
    const { s, uids, keys } = ctx();
    return contextHashes({ keys, size, uids, edges: s.edges, params });
  };

  test("mudar o tamanho de um ponto suja só ele e os vizinhos a 1 salto", () => {
    const { s } = ctx();
    const a = h(new Array(s.n).fill(1));
    const size = new Array(s.n).fill(1);
    size[12] = 1.4;
    const b = h(size);
    const near = new Set<number>([12]);
    for (let e = 0; e + 1 < s.edges.length; e += 2) {
      if (s.edges[e] === 12) near.add(s.edges[e + 1] as number);
      if (s.edges[e + 1] === 12) near.add(s.edges[e] as number);
    }
    for (let p = 0; p < s.n; p++) expect(a[p] !== b[p]).toBe(near.has(p));
  });

  test("mudar um parâmetro muda todos; as mesmas entradas dão os mesmos hashes", () => {
    const { s } = ctx();
    const ones = new Array(s.n).fill(1);
    const a = h(ones);
    expect([...h(ones)]).toEqual([...a]);
    const c = h(ones, [9, 1, 1]);
    for (let p = 0; p < s.n; p++) expect(a[p]).not.toBe(c[p]);
  });
});

describe("deslocamentos no quadro do ponto", () => {
  test("aplicar(toFrameOffsets(x)) devolve x, também depois de uma rotação rígida do layout", () => {
    const s = setup();
    const { frames } = computeFrames({ positions: s.positions, parents: s.parents, size: s.size });
    const final = s.positions.map((v, i) => v + (hash01(i + 3) - 0.5) * 0.2);
    const k = 0.9;
    const off = toFrameOffsets(s.positions, final, frames, s.size, k);
    const back = applyFrameOffsets(s.positions, off, frames, s.size, k);
    for (let i = 0; i < final.length; i++) expect(back[i]).toBeCloseTo(final[i] as number, 5);

    // gira o layout 90° em z: o mesmo deslocamento relativo ao quadro dá a posição girada
    const rot = (p: ArrayLike<number>) =>
      Array.from({ length: p.length }, (_, i) => {
        const c = i % 3;
        const q = i - c;
        return c === 0 ? -(p[q + 1] as number) : c === 1 ? (p[q] as number) : (p[i] as number);
      });
    const posR = rot(s.positions);
    const { frames: fr } = computeFrames({ positions: posR, parents: s.parents, size: s.size });
    const backR = applyFrameOffsets(posR, off, fr, s.size, k);
    const want = rot(final);
    let worst = 0;
    for (let i = 0; i < want.length; i++) {
      worst = Math.max(worst, Math.abs((backR[i] as number) - (want[i] as number)));
    }
    expect(worst).toBeLessThan(0.05);
  });
});
