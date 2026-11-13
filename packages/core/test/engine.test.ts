// SPDX-License-Identifier: GPL-3.0-or-later
// Motor de pontos: armazém, uids, propriedades esparsas, seleção e ferramentas.
import { describe, expect, test } from "vitest";
import {
  align,
  applyOverrides,
  assignUids,
  box,
  brushMask,
  bucketMask,
  buildGraph,
  byColumn,
  byGroup,
  combine,
  emptyOverrides,
  filterMask,
  fromJson,
  gradientBySeq,
  invert,
  maskCount,
  maskIndices,
  neighborhood,
  type Op,
  orderChain,
  type Pattern,
  PointStore,
  pathShortest,
  pathYarn,
  polygon2d,
  type Row,
  setProp,
  signatures,
  smooth,
  sphere,
  stripes,
  toJson,
} from "../src/index.ts";

const sc = (count: number | "rest"): Op => ({ kind: "stitch", code: "SC", count });
const inc = (count: number): Op => ({ kind: "inc", k: 2, count });
const rep = (times: number, ...ops: Op[]): Op => ({ kind: "repeat", times, ops });
const row = (label: string, ops: Op[], extra: Partial<Row> = {}): Row => ({
  label,
  kind: "round",
  ops,
  ...extra,
});
const cap = (extra: Row[] = []): Pattern => ({
  dialect: "pt-BR",
  rows: [
    row("1", [sc(6)], { start: "magicRing" }),
    row("2", [inc(6)]),
    row("3", [rep(6, sc(1), inc(1))]),
    ...extra,
  ],
});
const store = (p: Pattern) => PointStore.fromGraph(buildGraph(p));

describe("armazém de pontos", () => {
  const s = store(cap());
  test("tamanho, uids sequenciais e ordem de trabalho", () => {
    expect(s.n).toBe(1 + 6 + 12 + 18); // anel mágico + 3 voltas
    expect(s.uid[0]).toBe(1);
    expect(s.uid[s.n - 1]).toBe(s.n);
    expect(s.seq[5]).toBe(5);
    expect(s.indexOf(7)).toBe(6);
    expect(s.indexOf(9999)).toBe(-1);
  });
  test("grupos e vizinhos", () => {
    expect(s.group[0]).toBe(0);
    expect(s.group[1]).toBe(1);
    expect(s.group[7]).toBe(2);
    const nb: number[] = [];
    s.forNeighbors(1, (j) => nb.push(j));
    expect(nb).toContain(2);
    expect(nb).toContain(6); // volta fechada
  });
  test("20.000 pontos montam rápido", () => {
    const big: Pattern = {
      dialect: "pt-BR",
      rows: [row("1", [sc(100)], { start: "chain" }), row("2-200", [sc("rest")], { repeatRows: 199 })],
    };
    const t = performance.now();
    const b = store(big);
    expect(b.n).toBe(20000);
    expect(performance.now() - t).toBeLessThan(1500);
  });
});

describe("uids permanentes", () => {
  test("acrescentar voltas mantém os uids dos que já existiam", () => {
    const a = store(cap());
    const sa = assignUids(null, signatures(a));
    const b = store(cap([row("4", [sc("rest")])]));
    const sb = assignUids(sa, signatures(b));
    for (let i = 0; i < a.n; i++) expect(sb.uids[i]).toBe(sa.uids[i]);
    expect(sb.uids[b.n - 1]).toBe(sa.next + (b.n - a.n) - 1);
  });
  test("alinhamento acha correspondência após inserção no começo", () => {
    const x = Uint32Array.from([1, 2, 3, 4, 5]);
    const y = Uint32Array.from([9, 1, 2, 3, 4, 5]);
    expect([...align(x, y)]).toEqual([-1, 0, 1, 2, 3, 4]);
  });
  test("alinhamento com troca no miolo", () => {
    const x = Uint32Array.from([1, 2, 3, 4, 5, 6]);
    const y = Uint32Array.from([1, 2, 7, 8, 5, 6]);
    expect([...align(x, y)]).toEqual([0, 1, -1, -1, 4, 5]);
  });
  test("alinhamento com remoção e inserção separadas", () => {
    const x = Uint32Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const y = Uint32Array.from([1, 3, 4, 9, 5, 6, 8]);
    expect([...align(x, y)]).toEqual([0, 2, 3, -1, 4, 5, 7]);
  });
});

describe("propriedades esparsas", () => {
  test("valor padrão não ocupa espaço; ida e volta JSON", () => {
    const s = store(cap());
    const o = emptyOverrides();
    setProp(o, "yarn", [3, 4, 5], 1);
    setProp(o, "yarn", [4], 0);
    setProp(o, "tension", [10], 0.5);
    expect(o.yarn?.size).toBe(2);
    const o2 = fromJson(JSON.parse(JSON.stringify(toJson(o))));
    applyOverrides(s, o2);
    expect(s.col("yarn")[2]).toBe(1);
    expect(s.col("yarn")[3]).toBe(0);
    expect(s.col("tension")[9]).toBeCloseTo(0.5);
  });
});

describe("seleção", () => {
  const s = store(cap());
  test("por volta, filtro e operações", () => {
    const g2 = byGroup(s, 2);
    expect(maskCount(g2)).toBe(12);
    const g23 = byGroup(s, 2, 3);
    expect(maskCount(g23)).toBe(30);
    expect(maskCount(combine(g2, g23, "intersect"))).toBe(12);
    expect(maskCount(combine(g23, g2, "remove"))).toBe(18);
    expect(maskCount(invert(g23))).toBe(7); // volta 1 + anel
    expect(maskCount(filterMask(s, { group: [1, 3], seq: [1, 6] }))).toBe(6);
  });
  test("coluna passa por todas as voltas", () => {
    const col = byColumn(s, 0);
    expect(maskCount(col)).toBeGreaterThanOrEqual(3);
    expect(col[0]).toBe(1);
  });
  test("vizinhança, caminho do fio e caminho curto", () => {
    expect(maskCount(neighborhood(s, 0, 0))).toBe(1);
    expect(maskCount(neighborhood(s, 0, 1))).toBeGreaterThan(3);
    expect(pathYarn(s, 2, 5)).toEqual([2, 3, 4, 5]);
    expect(pathYarn(s, 5, 2)).toEqual([5, 4, 3, 2]);
    const p = pathShortest(s, 0, 3);
    expect(p[0]).toBe(0);
    expect(p[p.length - 1]).toBe(3);
    expect(p.length).toBeLessThanOrEqual(4);
  });
  test("formas 3D e laço na tela", () => {
    for (let i = 0; i < s.n; i++) {
      s.pos[i * 3] = i;
      s.pos[i * 3 + 1] = 0;
      s.pos[i * 3 + 2] = 0;
    }
    expect(maskCount(sphere(s, { x: 10, y: 0, z: 0 }, 2))).toBe(5);
    expect(maskCount(box(s, { x: 0, y: -1, z: -1 }, { x: 4, y: 1, z: 1 }))).toBe(5);
    const xy = new Float32Array(s.n * 2);
    for (let i = 0; i < s.n; i++) xy[i * 2] = i;
    const lasso = polygon2d(xy, s.n, [
      [-0.5, -1],
      [3.5, -1],
      [3.5, 1],
      [-0.5, 1],
    ]);
    expect([...maskIndices(lasso)]).toEqual([0, 1, 2, 3]);
  });
  test("cadeia linear: fechada, aberta e vazia", () => {
    const ring = orderChain(s, byGroup(s, 1));
    expect(ring?.closed).toBe(true);
    expect(ring?.order).toHaveLength(6);
    const seg = orderChain(s, filterMask(s, { seq: [1, 3] }));
    expect(seg?.closed).toBe(false);
    expect(seg?.order).toEqual([1, 2, 3]);
    expect(orderChain(s, new Uint8Array(s.n))).toBeNull();
  });
});

describe("ferramentas", () => {
  const s = store(cap());
  test("pincel por saltos e balde por região", () => {
    expect(maskCount(brushMask(s, 0, 1))).toBeGreaterThan(1);
    const yarn = s.col("yarn");
    for (let i = 7; i < 19; i++) yarn[i] = 1;
    expect(maskCount(bucketMask(s, 7, "yarn"))).toBe(12);
    expect(maskCount(bucketMask(s, 1, "yarn"))).toBe(7); // anel + volta 1, a volta 2 corta
    expect(maskCount(bucketMask(s, 19, "yarn"))).toBe(18);
  });
  test("listras 2A/1B", () => {
    const out = stripes(
      s,
      [
        [0, 2],
        [1, 1],
      ],
      byGroup(s, 1, 3),
    );
    expect(out[1]).toBe(0);
    expect(out[7]).toBe(0);
    expect(out[19]).toBe(1);
  });
  test("gradiente e suavização", () => {
    const g = gradientBySeq(s, byGroup(s, 1, 3), -1, 1);
    expect(g[1]).toBeCloseTo(-1);
    expect(g[s.n - 1]).toBeCloseTo(1);
    const t = s.col("tension");
    t[1] = 1;
    const sm = smooth(s, "tension", byGroup(s, 1, 3), 1);
    expect(sm[1] as number).toBeLessThan(1);
    expect(sm[2] as number).toBeGreaterThan(0);
  });
});
