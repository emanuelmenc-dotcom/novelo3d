// SPDX-License-Identifier: GPL-3.0-or-later
// Motor de posições: forma, determinismo, escala e conferência contra o layout do CrochetPARADE (export da F0).
import { readFileSync } from "node:fs";
import { buildGraph } from "@novelo/core";
import { fromCp, parseCpDot } from "@novelo/interop";
import { parsePattern } from "@novelo/notation";
import { describe, expect, test } from "vitest";
import { graphEdges, layoutGraph, pairDistanceCorrelation } from "../src/index.ts";

const dir = new URL("../../../referencia/cp-export-esfera20/", import.meta.url);

const P_BOLA = `V1: 6 pb no anel mágico (6)
V2: 6 aum (12)
V3: (1 pb, 1 aum) x6 (18)
V4: (2 pb, 1 aum) x6 (24)
V5: (3 pb, 1 aum) x6 (30)
V6: (4 pb, 1 aum) x6 (36)
V7–12: 1 pb em cada ponto (36)
V13: (4 pb, 1 dim) x6 (30)
V14: (3 pb, 1 dim) x6 (24)
V15: (2 pb, 1 dim) x6 (18)
V16: (1 pb, 1 dim) x6 (12)
V17: 6 dim (6)`;

const bbox = (p: Float32Array) => {
  const lo = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const hi = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k] as number, p[i + k] as number);
      hi[k] = Math.max(hi[k] as number, p[i + k] as number);
    }
  }
  return [0, 1, 2].map((k) => (hi[k] as number) - (lo[k] as number)).sort((a, b) => b - a);
};

describe("posições 3D", () => {
  const graph = buildGraph(parsePattern(P_BOLA).pattern);

  test("o grafo da P-BOLA tem 433 nós (432 pontos + anel) e arestas de carreira e coluna", () => {
    expect(graph.nodes).toHaveLength(433);
    expect(graphEdges(graph).length / 2).toBeGreaterThan(433);
  });

  test("é determinístico e sem NaN", () => {
    const a = layoutGraph(graph, { seed: 7 });
    const b = layoutGraph(graph, { seed: 7 });
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(a.positions.every((v) => Number.isFinite(v))).toBe(true);
    const c = layoutGraph(graph, { seed: 8 });
    expect(Array.from(c.positions)).not.toEqual(Array.from(a.positions));
  });

  test("a bola fica redonda e com pontos de tamanho 1", () => {
    const r = layoutGraph(graph);
    expect(r.stats.meanEdge).toBeGreaterThan(0.85);
    expect(r.stats.meanEdge).toBeLessThan(1.15);
    const [d1, d2, d3] = bbox(r.positions) as [number, number, number];
    expect(d3 / d1).toBeGreaterThan(0.65); // não é um disco achatado
    expect(d2 / d1).toBeGreaterThan(0.8);
    // Numa esfera a distância no grafo é um arco e a euclidiana é uma corda: razão média ~0,78,
    // logo erro relativo ~0,22 é o esperado de uma bola correta.
    expect(r.stats.relError).toBeLessThan(0.3);
  });

  test("oráculo: distâncias entre pares batem com o layout do CrochetPARADE (correlação >= 0,9)", () => {
    const debug = readFileSync(new URL("debug.txt", dir), "utf8");
    const original = /=======Original text:=======\n([\s\S]*?)\n=======/.exec(debug)?.[1] ?? "";
    const cp = fromCp(original);
    if (!cp.ok) throw new Error("fromCp falhou");
    const g = buildGraph(cp.value);
    const ours = layoutGraph(g);
    const dot = parseCpDot(readFileSync(new URL("crochet.dot", dir), "utf8"));
    if (!dot.ok) throw new Error("dot inválido");

    const byKey = new Map<string, number>();
    for (const n of g.nodes) byKey.set(`${n.rowIndex + 1},${n.indexInRow}`, n.id);
    const a: number[] = [];
    const b: number[] = [];
    for (const node of dot.value.nodes) {
      const [r, i] = (node.name.split("|")[0] ?? "").split(",").map(Number) as [number, number];
      const id = byKey.get(`${r},${i}`);
      if (id === undefined) continue;
      a.push(...node.pos);
      b.push(
        ours.positions[id * 3] as number,
        ours.positions[id * 3 + 1] as number,
        ours.positions[id * 3 + 2] as number,
      );
    }
    expect(a.length / 3).toBe(dot.value.nodes.length); // todos os nós do CP têm par
    expect(pairDistanceCorrelation(a, b)).toBeGreaterThanOrEqual(0.9);
  });

  test("peça grande (20.000 pontos) fecha em tempo razoável, no modo de pivôs", () => {
    const rows = [
      "V1: 6 pb no anel mágico (6)",
      "V2: 6 aum (12)",
      "V3: (1 pb, 1 aum) x6 (18)",
      "V4: (2 pb, 1 aum) x6 (24)",
    ];
    const text = `${rows.join("\n")}\nV5–${4 + 833}: 1 pb em cada ponto (24)`;
    const big = buildGraph(parsePattern(text).pattern);
    expect(big.nodes.length).toBeGreaterThan(20_000);
    const t0 = performance.now();
    const r = layoutGraph(big);
    const ms = performance.now() - t0;
    expect(r.stats.mode).toBe("pivots");
    expect(r.positions.every((v) => Number.isFinite(v))).toBe(true);
    expect(r.stats.meanEdge).toBeGreaterThan(0.7);
    expect(r.stats.meanEdge).toBeLessThan(1.3);
    expect(ms).toBeLessThan(60_000);
    // o tubo (24 pontos por volta, 834 voltas) tem de ficar reto: centros das voltas perto do eixo
    let worst = 0;
    for (const row of big.rows) {
      let cx = 0;
      let cy = 0;
      const count = row.last - row.first + 1;
      for (let i = row.first; i <= row.last; i++) {
        cx += r.positions[i * 3] as number;
        cy += r.positions[i * 3 + 1] as number;
      }
      worst = Math.max(worst, Math.hypot(cx / count, cy / count));
    }
    console.log(`tubo: desvio máximo do eixo ${worst.toFixed(2)} pontos`);
    expect(worst).toBeLessThan(4);
    console.log(
      `layout de ${big.nodes.length} nós: ${Math.round(ms)} ms, aresta média ${r.stats.meanEdge.toFixed(3)}`,
    );
  }, 120_000);
});

describe("tamanhos de ponto (tensão)", () => {
  const g = buildGraph(parsePattern(P_BOLA).pattern);
  const edgeMean = (pos: Float32Array, edges: Int32Array, pick: (a: number, b: number) => boolean) => {
    let sum = 0;
    let c = 0;
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e] as number;
      const b = edges[e + 1] as number;
      if (!pick(a, b)) continue;
      sum += Math.hypot(
        (pos[a * 3] as number) - (pos[b * 3] as number),
        (pos[a * 3 + 1] as number) - (pos[b * 3 + 1] as number),
        (pos[a * 3 + 2] as number) - (pos[b * 3 + 2] as number),
      );
      c++;
    }
    return sum / c;
  };
  test("pontos maiores ficam mais afastados que os normais", () => {
    const n = g.nodes.length;
    const sizes = new Float32Array(n).fill(1);
    const big = new Set<number>();
    for (const nd of g.nodes) if (nd.rowIndex >= 6 && nd.rowIndex <= 10) big.add(nd.id);
    for (const i of big) sizes[i] = 1.6;
    const r = layoutGraph(g, { sizes });
    const eBig = edgeMean(r.positions, r.edges, (a, b) => big.has(a) && big.has(b));
    const eNorm = edgeMean(r.positions, r.edges, (a, b) => !big.has(a) && !big.has(b));
    expect(eBig / eNorm).toBeGreaterThan(1.2);
  });
  test("tamanhos todos 1 dão o mesmo resultado que sem tamanhos", () => {
    const a = layoutGraph(g, { seed: 3 });
    const b = layoutGraph(g, { seed: 3, sizes: new Float32Array(g.nodes.length).fill(1) });
    expect(Array.from(b.positions)).toEqual(Array.from(a.positions));
  });
});

describe("partida a quente", () => {
  const text = (rows: number) =>
    [
      "V1: 6 pb no anel mágico (6)",
      "V2: 6 aum (12)",
      "V3: (1 pb, 1 aum) x6 (18)",
      "V4: (2 pb, 1 aum) x6 (24)",
      `V5–${rows}: 1 pb em cada ponto (24)`,
    ].join("\n");
  const g = buildGraph(parsePattern(text(60)).pattern);
  const n = g.nodes.length;
  const sizes = new Float32Array(n).fill(1);
  for (let i = Math.floor(n / 3); i < Math.floor(n / 2); i++) sizes[i] = 1.4;

  test("com só os tamanhos alterados, o resultado a quente é parecido com o a frio e bem mais rápido", () => {
    const base = layoutGraph(g, { sizes: new Float32Array(n).fill(1) });
    let t = performance.now();
    const cold = layoutGraph(g, { sizes });
    const coldMs = performance.now() - t;
    t = performance.now();
    const warm = layoutGraph(g, { sizes, initial: base.positions });
    const warmMs = performance.now() - t;
    expect(pairDistanceCorrelation(warm.positions, cold.positions)).toBeGreaterThan(0.98);
    expect(warmMs).toBeLessThan(coldMs * 0.6);
  });

  test("initial com tamanho errado é ignorado", () => {
    const a = layoutGraph(g, { seed: 3 });
    const b = layoutGraph(g, { seed: 3, initial: new Float32Array(9) });
    expect(Array.from(b.positions)).toEqual(Array.from(a.positions));
  });
});
