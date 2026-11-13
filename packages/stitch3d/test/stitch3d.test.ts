// SPDX-License-Identifier: GPL-3.0-or-later
// Modelo 3D dos pontos: registro, orçamento de triângulos, continuidade do fio, matrizes, orientação das faces e cache.
import { buildGraph, STITCH_TYPES, stitchType } from "@novelo/core";
import { layoutGraph } from "@novelo/layout";
import { parsePattern } from "@novelo/notation";
import { describe, expect, test } from "vitest";
import {
  anchorsOf,
  BatchTable,
  bandOf,
  buildTubeLod,
  centerlines,
  computeFrames,
  computeMatrices,
  deformPoint,
  deformToCurve,
  extrude,
  ModelCache,
  modelKey,
  parseModelKey,
  RHO_BANDS,
  SIDES,
} from "../src/index.ts";

const BOLA = [
  "V1: 6 pb no anel mágico (6)",
  "V2: 6 aum (12)",
  "V3: (1 pb, 1 aum) x6 (18)",
  "V4: (2 pb, 1 aum) x6 (24)",
  "V5–8: 1 pb em cada ponto (24)",
  "V9: (2 pb, 1 dim) x6 (18)",
  "V10: (1 pb, 1 dim) x6 (12)",
  "V11: 6 dim (6)",
].join("\n");

const setup = (text: string) => {
  const g = buildGraph(parsePattern(text).pattern);
  const r = layoutGraph(g);
  const n = g.nodes.length;
  return {
    g,
    n,
    positions: r.positions,
    parents: g.nodes.map((nd) => nd.parents),
    size: new Float32Array(n).fill(1),
  };
};

const key = (type: string, legs = 1, band = 2, mirror = false) =>
  modelKey({ type, version: stitchType(type)?.version ?? 1, legs, band, mirror, tension: 4, quality: 0 });

describe("registro de tipos", () => {
  test("os tipos embutidos mantêm a ordem dos índices e têm nomes nos três dialetos", () => {
    expect(STITCH_TYPES.map((t) => t.id)).toEqual(["RING", "CH", "SL", "SC", "HDC", "DC", "TR"]);
    for (const t of STITCH_TYPES) {
      expect(t.builtin).toBe(true);
      for (const d of ["pt-BR", "en-US", "en-UK"] as const) expect(t.names[d].length).toBeGreaterThan(0);
    }
    expect(stitchType("DC")?.lengthFactor).toBe(2);
  });
});

describe("modelos por variante", () => {
  const cache = new ModelCache();
  test("chave faz ida e volta; faixa de raio mais próxima", () => {
    const k = key("SC", 2, 3, true);
    expect(k).toBe("SC@1|L2|R3|F1|T4|Q0");
    expect(parseModelKey(k)).toEqual({
      type: "SC",
      version: 1,
      legs: 2,
      band: 3,
      mirror: true,
      tension: 4,
      quality: 0,
    });
    // chave antiga (sem T e Q) vale T4 e Q0; campos em qualquer ordem
    expect(parseModelKey("SC@1|L2|R3|F1")).toEqual(parseModelKey(k));
    expect(parseModelKey("SC@1|Q2|F0|T7|R1|L1")).toMatchObject({ quality: 2, tension: 7, band: 1, legs: 1 });
    expect(parseModelKey("SC@1|L1|R1|F0|T9")).toBeNull();
    expect(parseModelKey("SC@1|L1|R1|F0|X1")).toBeNull();
    expect(parseModelKey("lixo")).toBeNull();
    expect(bandOf(0.16)).toBe(2);
    expect(bandOf(0.5)).toBe(RHO_BANDS.length - 1);
  });

  test("orçamento de triângulos por tipo", () => {
    const tri = (t: string, legs = 1) => cache.get(key(t, legs)).triangles;
    expect(tri("SC")).toBeLessThanOrEqual(100);
    expect(tri("CH")).toBeLessThanOrEqual(64);
    expect(tri("SL")).toBeLessThanOrEqual(64);
    expect(tri("HDC")).toBeLessThanOrEqual(130);
    expect(tri("DC")).toBeLessThanOrEqual(160);
    expect(tri("TR")).toBeLessThanOrEqual(200);
    expect(tri("RING")).toBeLessThanOrEqual(64);
    expect(tri("SC", 2)).toBeGreaterThan(tri("SC")); // diminuição tem mais pernas
    expect(tri("TR")).toBeGreaterThan(tri("DC"));
  });

  test("cada chave é gerada uma vez", () => {
    const c = new ModelCache();
    c.get(key("SC"));
    c.get(key("SC"));
    c.get(key("DC"));
    expect(c.builds).toBe(2);
    expect(c.size).toBe(2);
    expect(() => c.get("XX@1|L1|R2|F0")).toThrow(/não existe/);
  });

  test("as faces apontam para fora do fio, também na variante espelhada", () => {
    for (const [type, mirror] of [
      ["SC", false],
      ["SC", true],
      ["RING", false],
      ["CH", false],
    ] as const) {
      const m = cache.get(key(type, 1, 2, mirror));
      let ok = 0;
      let total = 0;
      for (let t = 0; t < m.indices.length; t += 3) {
        const a = m.indices[t] as number;
        const b = m.indices[t + 1] as number;
        const c = m.indices[t + 2] as number;
        const p = (i: number) =>
          [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]] as number[];
        const [pa, pb, pc] = [p(a), p(b), p(c)] as [number[], number[], number[]];
        const u = [0, 1, 2].map((k) => (pb[k] as number) - (pa[k] as number));
        const v = [0, 1, 2].map((k) => (pc[k] as number) - (pa[k] as number));
        const nrm = [
          (u[1] as number) * (v[2] as number) - (u[2] as number) * (v[1] as number),
          (u[2] as number) * (v[0] as number) - (u[0] as number) * (v[2] as number),
          (u[0] as number) * (v[1] as number) - (u[1] as number) * (v[0] as number),
        ];
        // centroide do anel de 4 vértices do tubo a que o vértice pertence: a face deve apontar para longe dele
        const ring = Math.floor(a / 4) * 4;
        const cen = [0, 1, 2].map(
          (k) => [0, 1, 2, 3].reduce((s, q) => s + (m.positions[(ring + q) * 3 + k] as number), 0) / 4,
        );
        const fc = [0, 1, 2].map((k) => ((pa[k] as number) + (pb[k] as number) + (pc[k] as number)) / 3);
        const d = [0, 1, 2].reduce(
          (s, k) => s + (nrm[k] as number) * ((fc[k] as number) - (cen[k] as number)),
          0,
        );
        total++;
        if (d > 0) ok++;
      }
      expect(ok / total).toBeGreaterThan(0.95);
    }
  });
});

describe("referencial e matriz por ponto", () => {
  const { g, n, positions, parents, size } = setup(BOLA);
  const mats = computeMatrices({ positions, parents, size });

  test("sem NaN e com determinante positivo em todos os pontos (aumento, diminuição, anel)", () => {
    for (let i = 0; i < n; i++) {
      const o = i * 16;
      for (let k = 0; k < 16; k++) expect(Number.isFinite(mats[o + k] as number)).toBe(true);
      const a = [mats[o], mats[o + 1], mats[o + 2]] as number[];
      const b = [mats[o + 4], mats[o + 5], mats[o + 6]] as number[];
      const c = [mats[o + 8], mats[o + 9], mats[o + 10]] as number[];
      const det =
        (a[0] as number) * ((b[1] as number) * (c[2] as number) - (b[2] as number) * (c[1] as number)) -
        (a[1] as number) * ((b[0] as number) * (c[2] as number) - (b[2] as number) * (c[0] as number)) +
        (a[2] as number) * ((b[0] as number) * (c[1] as number) - (b[1] as number) * (c[0] as number));
      expect(det).toBeGreaterThan(0);
    }
    expect(g.nodes.some((nd) => nd.parents.length > 1)).toBe(true); // há diminuição na receita
  });

  test("o fio é contínuo: a saída de um ponto é a entrada do seguinte", () => {
    let exact = 0;
    for (let i = 1; i < n - 1; i++) {
      const a = anchorsOf(mats, i);
      const b = anchorsOf(mats, i + 1);
      const d = Math.hypot(a.exit[0] - b.entry[0], a.exit[1] - b.entry[1], a.exit[2] - b.entry[2]);
      expect(d).toBeLessThan(0.6); // com o limite dos eixos a emenda pode abrir um pouco
      if (d < 1e-4) exact++;
    }
    expect(exact / (n - 2)).toBeGreaterThan(0.8);
  });

  test("a base do ponto cai perto da média das bases", () => {
    let close = 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const par = parents[i] as number[];
      if (par.length === 0) continue;
      const bx = par.reduce((s, q) => s + (positions[q * 3] as number), 0) / par.length;
      const by = par.reduce((s, q) => s + (positions[q * 3 + 1] as number), 0) / par.length;
      const bz = par.reduce((s, q) => s + (positions[q * 3 + 2] as number), 0) / par.length;
      const a = anchorsOf(mats, i).base;
      total++;
      if (Math.hypot(a[0] - bx, a[1] - by, a[2] - bz) < 0.7) close++;
    }
    expect(close / total).toBeGreaterThan(0.9);
  });

  test("trechos separados (peças) não se ligam entre si", () => {
    const two = computeMatrices({
      positions: [...Array.from(positions), ...Array.from(positions).map((v) => v + 100)],
      parents: [...parents, ...parents.map((p) => p.map((q) => q + n))],
      size: new Float32Array(2 * n).fill(1),
      ranges: [
        { offset: 0, count: n },
        { offset: n, count: n },
      ],
    });
    const lastA = anchorsOf(two, n - 1);
    const firstB = anchorsOf(two, n);
    expect(Math.hypot(lastA.exit[0] - firstB.entry[0], lastA.exit[1] - firstB.entry[1])).toBeGreaterThan(50);
  });

  test("20 mil matrizes em tempo curto", () => {
    const big = setup(
      [
        "V1: 6 pb no anel mágico (6)",
        "V2: 6 aum (12)",
        "V3: (1 pb, 1 aum) x6 (18)",
        "V4: (2 pb, 1 aum) x6 (24)",
        "V5–838: 1 pb em cada ponto (24)",
      ].join("\n"),
    );
    const t = performance.now();
    const m = computeMatrices({ positions: big.positions, parents: big.parents, size: big.size });
    const ms = performance.now() - t;
    expect(big.n).toBeGreaterThan(20000);
    expect(m.length).toBe(big.n * 16);
    expect(ms).toBeLessThan(600);
  }, 30_000); // o layout de 20 mil pontos da preparação passa de 5 s com a máquina ocupada
});

describe("tubo contínuo (nível de detalhe)", () => {
  test("8 triângulos por ponto, uma malha, e cada vértice sabe o seu ponto", () => {
    const { n, positions, size } = setup(BOLA);
    const lod = buildTubeLod(positions, size, 0.12);
    expect(lod.triangles).toBe((n - 1) * 8);
    expect(lod.vertexNode.length).toBe(n * 4);
    expect(lod.vertexNode[4 * 7]).toBe(7);
  });
});

describe("R3a: chave, malha, âncoras, curva e lotes", () => {
  const spec = (over: Partial<Parameters<typeof modelKey>[0]> = {}) => ({
    type: "SC",
    version: 1,
    legs: 1,
    band: 2,
    mirror: false,
    tension: 4,
    quality: 0,
    ...over,
  });

  test("chave: ida e volta em muitas combinações", () => {
    let seed = 7;
    const rnd = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let i = 0; i < 200; i++) {
      const s = spec({
        type: ["RING", "CH", "SL", "SC", "HDC", "DC", "TR"][rnd(7)] as string,
        legs: 1 + rnd(4),
        band: rnd(5),
        mirror: rnd(2) === 1,
        tension: rnd(9),
        quality: rnd(3),
      });
      expect(parseModelKey(modelKey(s))).toEqual(s);
    }
  });

  const lines = (q: number, type = "SC") => centerlines({ ...spec({ type, quality: q }), tension: 4 });

  test("normais unitárias e apontando para fora; malha fechada com orientação consistente (qualidade 1 e 2)", () => {
    for (const q of [1, 2]) {
      const m = extrude(lines(q), 0.16, SIDES[q] as number, false, true);
      for (let v = 0; v < m.normals.length; v += 3) {
        expect(
          Math.hypot(m.normals[v] as number, m.normals[v + 1] as number, m.normals[v + 2] as number),
        ).toBeCloseTo(1, 4);
      }
      // cada aresta orientada (u,v) tem exatamente uma inversa (v,u) quando as posições iguais são identificadas
      const key = (i: number) =>
        [0, 1, 2].map((k) => Math.round((m.positions[i * 3 + k] as number) * 1e4)).join(",");
      const dir = new Map<string, number>();
      for (let t = 0; t < m.indices.length; t += 3) {
        for (let e = 0; e < 3; e++) {
          const a = key(m.indices[t + e] as number);
          const b = key(m.indices[t + ((e + 1) % 3)] as number);
          dir.set(`${a}>${b}`, (dir.get(`${a}>${b}`) ?? 0) + 1);
        }
      }
      let open = 0;
      for (const [k, c] of dir) {
        const [a, b] = k.split(">") as [string, string];
        if (c !== 1 || dir.get(`${b}>${a}`) !== 1) open++;
      }
      expect(open).toBe(0);
    }
  });

  test("índices de 32 bits quando passa de 65.535 vértices", () => {
    const long = {
      pts: Array.from({ length: 20000 }, (_, i) => [i * 0.01, 0, 0] as [number, number, number]),
      closed: false,
    };
    const m = extrude([long], 0.05, 4, false, false);
    expect(m.indices instanceof Uint32Array).toBe(true);
    expect(extrude(lines(0), 0.16, 4, false, false).indices instanceof Uint16Array).toBe(true);
  });

  test("computeFrames devolve E, X, B, C e eixos; X_i = E_(i+1) na maioria dos pontos", () => {
    const { n, positions, parents, size } = setup(BOLA);
    const { frames, matrices } = computeFrames({ positions, parents, size });
    expect(frames.n).toBe(n);
    expect(matrices.length).toBe(n * 16);
    let exact = 0;
    for (let i = 1; i < n - 1; i++) {
      const d = Math.hypot(
        (frames.X[i * 3] as number) - (frames.E[(i + 1) * 3] as number),
        (frames.X[i * 3 + 1] as number) - (frames.E[(i + 1) * 3 + 1] as number),
        (frames.X[i * 3 + 2] as number) - (frames.E[(i + 1) * 3 + 2] as number),
      );
      if (d < 1e-4) exact++;
    }
    expect(exact / (n - 2)).toBeGreaterThan(0.99);
  });

  test("curva: cai exatamente em E e X (fio contínuo) e o raio fica constante sob cisalhamento 2,5x", () => {
    const { n, positions, parents, size } = setup(BOLA);
    const { frames } = computeFrames({ positions, parents, size });
    for (let i = 1; i < n - 1; i += 7) {
      const e = deformPoint(frames, i, [-0.5, 0, 0]);
      const x = deformPoint(frames, i, [0.5, 0, 0]);
      const e2 = deformPoint(frames, i + 1, [-0.5, 0, 0]);
      expect(Math.hypot(x[0] - e2[0], x[1] - e2[1], x[2] - e2[2])).toBeLessThan(1e-3);
      expect(
        Math.hypot(e[0] - (frames.E[i * 3] as number), e[1] - (frames.E[i * 3 + 1] as number)),
      ).toBeLessThan(1e-4);
    }
    // quadro cisalhado: ey 2,5x e inclinado
    const f = {
      n: 1,
      E: Float32Array.from([-0.5, 0, 0]),
      X: Float32Array.from([0.5, 0, 0]),
      B: Float32Array.from([0, -2.5, 0]),
      C: Float32Array.from([0, 0, 0]),
      ex: Float32Array.from([1, 0, 0]),
      ey: Float32Array.from([0.9, 2.5, 0]),
      ez: Float32Array.from([0, 0, 1]),
      tE: Float32Array.from([1, 0, 0]),
      tX: Float32Array.from([1, 0, 0]),
      prev: Int32Array.from([-1]),
      next: Int32Array.from([-1]),
    };
    const sp = spec({ quality: 2 });
    const mesh = deformToCurve(sp, f, 0, 0.1);
    const path = centerlines(sp)[0]?.pts.map((p) => deformPoint(f, 0, p)) as number[][];
    const sides = SIDES[2];
    for (let i = 0; i < path.length; i += 3) {
      for (let s = 0; s < sides; s++) {
        const v = (i * sides + s) * 3;
        const d = Math.hypot(
          (mesh.positions[v] as number) - (path[i] as number[])[0]!,
          (mesh.positions[v + 1] as number) - (path[i] as number[])[1]!,
          (mesh.positions[v + 2] as number) - (path[i] as number[])[2]!,
        );
        expect(Math.abs(d - 0.1) / 0.1).toBeLessThan(0.05);
      }
    }
  });

  test("tabela de lotes: trocar o modelo de um ponto não mexe nos outros lotes", () => {
    const t = new BatchTable([0, 0, 1, 1, 1, 2]);
    expect(t.batches).toBe(3);
    const before1 = [...(t.lists[1] as number[])];
    const mv = t.move(0, 2);
    expect(mv).toMatchObject({ node: 0, from: { batch: 0, slot: 0 }, filled: 1 });
    expect(t.lists[0]).toEqual([1]);
    expect(t.lists[2]).toEqual([5, 0]);
    expect(t.lists[1]).toEqual(before1);
    expect(t.nodeSlot[1]).toBe(0);
    expect(t.move(1, 0)).toBeNull(); // já está no lote
    // invariante: slots sem buracos e coerentes
    for (const [b, list] of t.lists.entries()) {
      list.forEach((node, slot) => {
        expect(t.nodeBatch[node]).toBe(b);
        expect(t.nodeSlot[node]).toBe(slot);
      });
    }
  });

  test("cache: invalidar por prefixo e sobrescrever o modelo base", () => {
    const c = new ModelCache();
    c.get(key("SC"));
    c.get(key("DC"));
    expect(c.invalidate("SC@")).toBe(1);
    expect(c.has(key("SC"))).toBe(false);
    expect(c.has(key("DC"))).toBe(true);
    const custom = extrude(lines(0), 0.3, 4, false, false);
    c.set(key("DC"), custom);
    expect(c.get(key("DC"))).toBe(custom);
    expect(c.builds).toBe(2);
  });
});

describe("R3a (revisão): a curva se curva, os eixos e a seção são contínuos", () => {
  const pts = (list: number[][]) => Float32Array.from(list.flat());
  const three = () => {
    // três pontos não colineares: o meio do fio do ponto central deve sair da corda
    const positions = pts([
      [0, 0, 0],
      [1, 0.6, 0],
      [2, 0, 0],
    ]);
    const parents = [[], [], []] as number[][];
    return computeFrames({ positions, parents, size: new Float32Array(3).fill(1) }).frames;
  };

  test("o ponto médio da curva fica a mais de 1% da corda", () => {
    const f = three();
    const E = [f.E[3], f.E[4], f.E[5]] as number[];
    const X = [f.X[3], f.X[4], f.X[5]] as number[];
    const mid = deformPoint(f, 1, [0, 0, 0]);
    const chord = Math.hypot(
      (X[0] as number) - (E[0] as number),
      (X[1] as number) - (E[1] as number),
      (X[2] as number) - (E[2] as number),
    );
    // distância do ponto médio ao segmento E-X
    const d = [0, 1, 2].map((k) => (X[k] as number) - (E[k] as number));
    const w = [0, 1, 2].map((k) => (mid[k] as number) - (E[k] as number));
    const proj =
      ((w[0] as number) * (d[0] as number) +
        (w[1] as number) * (d[1] as number) +
        (w[2] as number) * (d[2] as number)) /
      (chord * chord);
    const off = Math.hypot(
      (w[0] as number) - proj * (d[0] as number),
      (w[1] as number) - proj * (d[1] as number),
      (w[2] as number) - proj * (d[2] as number),
    );
    expect(off / chord).toBeGreaterThan(0.01);
  });

  test("a tangente de saída de i é a de entrada de i+1 (todas as peças e ranges)", () => {
    const { n, positions, parents, size } = setup(BOLA);
    const { frames } = computeFrames({ positions, parents, size });
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < 3; k++) {
        expect(frames.tX[i * 3 + k]).toBeCloseTo(frames.tE[(i + 1) * 3 + k] as number, 6);
      }
    }
  });

  test("com deslocamento em y e z o tubo também é contínuo entre pontos vizinhos", () => {
    const { n, positions, parents, size } = setup(BOLA);
    const { frames } = computeFrames({ positions, parents, size });
    for (let i = 1; i < n - 2; i += 5) {
      for (const off of [
        [0, -0.5, 0.1],
        [0, 0.2, -0.3],
      ] as const) {
        const a = deformPoint(frames, i, [0.5, off[1], off[2]]);
        const b = deformPoint(frames, i + 1, [-0.5, off[1], off[2]]);
        expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(0.05);
      }
    }
  });

  test("RING e SC num referencial girado 90°: raio constante em todos os anéis da seção", () => {
    // base x→z, y→x, z→y (rotação de 90° em torno do eixo diagonal): nenhum eixo coincide com o do modelo
    const f = {
      n: 1,
      E: Float32Array.from([0, 0, -0.5]),
      X: Float32Array.from([0, 0, 0.5]),
      B: Float32Array.from([-1, 0, 0]),
      C: Float32Array.from([0, 0, 0]),
      ex: Float32Array.from([0, 0, 1]),
      ey: Float32Array.from([1, 0, 0]),
      ez: Float32Array.from([0, 1, 0]),
      tE: Float32Array.from([0, 0, 1]),
      tX: Float32Array.from([0, 0, 1]),
      prev: Int32Array.from([-1]),
      next: Int32Array.from([-1]),
    };
    for (const type of ["RING", "SC"]) {
      const sp = { type, version: 1, legs: 1, band: 2, mirror: false, tension: 4, quality: 2 };
      const mesh = deformToCurve(sp, f, 0, 0.1);
      const sides = SIDES[2];
      let base = 0;
      for (const line of centerlines(sp)) {
        const path = line.pts.map((p) => deformPoint(f, 0, p));
        for (let i = 0; i < path.length; i++) {
          for (let s = 0; s < sides; s++) {
            const v = (base + i * sides + s) * 3;
            const c = path[i] as number[];
            const d = Math.hypot(
              (mesh.positions[v] as number) - (c[0] as number),
              (mesh.positions[v + 1] as number) - (c[1] as number),
              (mesh.positions[v + 2] as number) - (c[2] as number),
            );
            expect(Math.abs(d - 0.1) / 0.1).toBeLessThan(0.05);
          }
        }
        // as pontas abertas ganham tampas (um vértice central e 2 cópias por lado do leque) depois dos anéis
        base += path.length * sides + (line.closed ? 0 : 2 * (1 + 2 * sides));
      }
    }
  });
});
