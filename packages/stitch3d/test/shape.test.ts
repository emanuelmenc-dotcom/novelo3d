// SPDX-License-Identifier: GPL-3.0-or-later
// Forma do ponto de base (R3d-2'): topo que abre e inclina na direção dos filhos, sem mudar o modelo neutro.
import { buildGraph } from "@novelo/core";
import { layoutGraph } from "@novelo/layout";
import { parsePattern } from "@novelo/notation";
import { describe, expect, test } from "vitest";
import {
  centerlines,
  computeFrames,
  deformPoint,
  deformToCurve,
  type ModelSpec,
  NEUTRAL,
  RHO_BANDS,
  shapedCenterlines,
  shapeKey,
  topShapes,
} from "../src/index.ts";

const RECIPE = [
  "V1: 6 pb no anel mágico (6)",
  "V2: 6 aum (12)",
  "V3: (1 pb, 1 aum) x6 (18)",
  "V4: (2 pb, 1 aum) x6 (24)",
  "V5: (3 pb, 1 dim) x6 (18)",
  "V6: 18 pb (18)",
].join("\n");

const SC: ModelSpec = { type: "SC", version: 1, legs: 1, band: 2, mirror: false, tension: 4, quality: 1 };

function setup() {
  const g = buildGraph(parsePattern(RECIPE).pattern);
  const r = layoutGraph(g);
  const n = g.nodes.length;
  const parents = g.nodes.map((nd) => nd.parents);
  const size = new Array(n).fill(1);
  const { frames } = computeFrames({ positions: r.positions, parents, size });
  const legs = parents.map((p) => Math.max(1, Math.min(4, p.length)));
  return { g, n, frames, parents, legs };
}

describe("forma do topo", () => {
  test("NEUTRAL dá as mesmas linhas e a mesma malha que hoje (bit a bit)", () => {
    expect(shapedCenterlines(SC, NEUTRAL)).toEqual(centerlines(SC));
    const { frames } = setup();
    const a = deformToCurve(SC, frames, 20);
    const b = deformToCurve(SC, frames, 20, undefined, NEUTRAL);
    expect([...b.positions]).toEqual([...a.positions]);
  });

  test("sem filhos: neutro; um filho: open 1; aumento: open 2; sem NaN", () => {
    const { g, n, frames, parents, legs } = setup();
    const sh = topShapes({ frames, parents, legs });
    expect(sh.length).toBe(n);
    const kids = new Array(n).fill(0);
    for (const nd of g.nodes) for (const p of nd.parents) kids[p]++;
    sh.forEach((s, p) => {
      expect(Number.isFinite(s.leanX) && Number.isFinite(s.leanZ)).toBe(true);
      if (kids[p] === 0) expect(s).toEqual(NEUTRAL);
      else expect(s.open).toBe(kids[p] >= 2 ? 2 : 1);
    });
    expect(kids.some((k) => k >= 2)).toBe(true);
    expect(kids.some((k) => k === 1)).toBe(true);
  });

  test("os valores são múltiplos de 0,05 e ficam dentro dos limites", () => {
    const { frames, parents, legs } = setup();
    for (const s of topShapes({ frames, parents, legs })) {
      expect(Math.abs(s.leanX)).toBeLessThanOrEqual(0.25 + 1e-9);
      expect(Math.abs(s.leanZ)).toBeLessThanOrEqual(0.15 + 1e-9);
      for (const v of [s.leanX, s.leanZ])
        expect(Math.abs(v / 0.05 - Math.round(v / 0.05))).toBeLessThan(1e-6);
    }
  });

  test("upTo ignora filhos posteriores", () => {
    const { n, frames, parents, legs } = setup();
    const early = topShapes({ frames, parents, legs, upTo: 5 });
    const all = topShapes({ frames, parents, legs });
    expect(early.length).toBe(n);
    // com só os 6 primeiros pontos existindo, os pontos da volta 3 em diante não têm filhos
    expect(early.slice(12).every((s) => s.open === 0)).toBe(true);
    expect(all.slice(0, 6).some((s) => s.open > 0)).toBe(true);
  });

  test("diminuição: toda base do ponto que fecha recebe forma (open ≥ 1)", () => {
    const { g, frames, parents, legs } = setup();
    const sh = topShapes({ frames, parents, legs });
    const dim = g.nodes.find((nd) => nd.parents.length >= 2 && nd.rowIndex === 4);
    expect(dim).toBeDefined();
    for (const p of dim?.parents ?? []) expect((sh[p]?.open ?? 0) >= 1).toBe(true);
  });

  test("inclinar o topo desloca só o arco e o topo das pernas, e as pontas ficam onde estavam (modelo simples)", () => {
    const simple: ModelSpec = { ...SC, quality: 0 };
    const neutral = centerlines(simple);
    const leaned = centerlines(simple, { open: 1, leanX: 0.2, leanZ: 0.1 });
    const arc0 = neutral[0]?.pts ?? [];
    const arc1 = leaned[0]?.pts ?? [];
    expect(arc1[0]).toEqual(arc0[0]);
    expect(arc1[arc1.length - 1]).toEqual(arc0[arc0.length - 1]);
    const mid = Math.floor(arc0.length / 2);
    expect((arc1[mid]?.[0] ?? 0) - (arc0[mid]?.[0] ?? 0)).toBeGreaterThan(0.1);
    // a perna continua ligada ao arco: o topo dela acompanha o pico, e o pé não muda
    const leg0 = neutral[1]?.pts ?? [];
    const leg1 = leaned[1]?.pts ?? [];
    expect(leg1[leg1.length - 1]).toEqual(leg0[leg0.length - 1]);
    expect(leg1[0]?.[0]).toBeGreaterThan(leg0[0]?.[0] ?? 0);
  });

  test("anel e laço não mudam com a forma", () => {
    for (const type of ["RING", "CH"] as const) {
      const spec: ModelSpec = { ...SC, type };
      expect(centerlines(spec, { open: 2, leanX: 0.2, leanZ: 0.1 })).toEqual(centerlines(spec));
    }
  });

  test("shapeKey é estável", () => {
    expect(shapeKey({ open: 1, leanX: 0.05, leanZ: 0 })).toBe("1:0.05:0");
  });

  /** Quadros sintéticos: pontos em fila no eixo x (centro em cx), eixos canônicos; C do filho dado à parte. */
  const synth = (centers: number[], childC: [number, number, number][] = []) => {
    const n = centers.length + childC.length;
    const mk = () => new Float32Array(n * 3);
    const fr = {
      n,
      E: mk(),
      X: mk(),
      B: mk(),
      C: mk(),
      ex: mk(),
      ey: mk(),
      ez: mk(),
      tE: mk(),
      tX: mk(),
      prev: new Int32Array(n).fill(-1),
      next: new Int32Array(n).fill(-1),
    };
    for (let p = 0; p < n; p++) {
      const cx = p < centers.length ? (centers[p] as number) : (childC[p - centers.length]?.[0] ?? 0);
      fr.E.set([cx - 0.5, 0, 0], p * 3);
      fr.X.set([cx + 0.5, 0, 0], p * 3);
      fr.ex.set([1, 0, 0], p * 3);
      fr.ey.set([0, 1, 0], p * 3);
      fr.ez.set([0, 0, 1], p * 3);
      fr.tE.set([1, 0, 0], p * 3);
      fr.tX.set([1, 0, 0], p * 3);
      fr.C.set(
        p < centers.length ? [cx, 0, 0] : (childC[p - centers.length] as [number, number, number]),
        p * 3,
      );
    }
    return fr;
  };

  test("filho deslocado em +x inclina o topo para +x, no máximo 0,25; deslocamento pequeno dá valor pequeno", () => {
    const far = topShapes({ frames: synth([0], [[0.9, 0.6, 0]]), parents: [[], [0]], legs: [1, 1] });
    expect(far[0]?.leanX).toBe(0.25);
    const near = topShapes({ frames: synth([0], [[0.1, 0.6, 0]]), parents: [[], [0]], legs: [1, 1] });
    expect(near[0]?.leanX).toBeCloseTo(0.1, 9);
    const left = topShapes({ frames: synth([0], [[-0.9, 0.6, 0]]), parents: [[], [0]], legs: [1, 1] });
    expect(left[0]?.leanX).toBe(-0.25);
  });

  test("diminuição: as duas bases inclinam para o lado do filho (sinais opostos)", () => {
    const sh = topShapes({
      frames: synth([-1, 1], [[0, 0.6, 0]]),
      parents: [[], [], [0, 1]],
      legs: [1, 1, 2],
    });
    expect(sh[0]?.leanX).toBeGreaterThan(0);
    expect(sh[1]?.leanX).toBeLessThan(0);
    expect(sh[0]?.open).toBe(1);
  });

  test("quadros degenerados (tudo coincidente, eixos nulos) não geram NaN", () => {
    const fr = synth([0], [[0, 0, 0]]);
    fr.ex.fill(0);
    fr.ez.fill(0);
    fr.E.fill(0);
    fr.X.fill(0);
    const sh = topShapes({ frames: fr, parents: [[], [0]], legs: [1, 1] });
    for (const t of sh) expect(Number.isFinite(t.leanX) && Number.isFinite(t.leanZ)).toBe(true);
  });

  test("peça espelhada: a inclinação em z vai para o mesmo lado do mundo que na peça normal", () => {
    const { frames } = setup();
    const shape = { open: 0 as const, leanX: 0, leanZ: 0.1 };
    const ez = (i: number) => [frames.ez[i * 3], frames.ez[i * 3 + 1], frames.ez[i * 3 + 2]] as number[];
    const drift = (mirror: boolean): number => {
      const spec: ModelSpec = { ...SC, mirror };
      const a = deformToCurve(spec, frames, 20);
      const b = deformToCurve(spec, frames, 20, undefined, shape);
      const e = ez(20);
      let sum = 0;
      for (let v = 0; v < a.positions.length / 3; v++) {
        for (let c = 0; c < 3; c++) {
          sum += ((b.positions[v * 3 + c] as number) - (a.positions[v * 3 + c] as number)) * (e[c] as number);
        }
      }
      return sum;
    };
    expect(drift(false)).toBeGreaterThan(0);
    expect(drift(true)).toBeGreaterThan(0);
  });

  test("fio contínuo (render): a inclinação move o topo, e as pontas E/X e o olho da base ficam onde estavam", () => {
    const neutral = centerlines(SC)[0]?.pts ?? [];
    const leaned = centerlines(SC, { open: 2, leanX: 0.2, leanZ: 0.1 })[0]?.pts ?? [];
    expect(leaned.length).toBe(neutral.length);
    expect(leaned[0]).toEqual(neutral[0]);
    expect(leaned[leaned.length - 1]).toEqual(neutral[neutral.length - 1]);
    // o ponto mais alto (topo) se desloca; o mais baixo (olho da base) não
    const top = (a: [number, number, number][]) => a.reduce((b, p) => (p[1] > b[1] ? p : b));
    const low = (a: [number, number, number][]) => a.reduce((b, p) => (p[1] < b[1] ? p : b));
    expect(Math.abs(top(leaned)[0] - top(neutral)[0])).toBeGreaterThan(0.05);
    expect(low(leaned)).toEqual(low(neutral));
  });

  test("pb, mpa e pa têm fio contínuo no render, com as voltas extras do tipo; a edição (Q0) continua simples", () => {
    for (const type of ["SC", "HDC", "DC", "TR"] as const) {
      const spec: ModelSpec = { ...SC, type, quality: 1 };
      const l = centerlines(spec);
      // um só traço por ponto (as laçadas são voltas do mesmo fio em torno da haste)
      expect(l.length).toBe(1);
      const main = l[0]?.pts ?? [];
      // da entrada à saída: começa em x = -0,5 e termina em x = +0,5
      expect(main[0]?.[0]).toBeCloseTo(-0.5, 9);
      expect(main[main.length - 1]?.[0]).toBeCloseTo(0.5, 9);
      expect(centerlines({ ...spec, quality: 0 }).length).toBeGreaterThanOrEqual(1);
    }
    // mais laçadas, mais pontos de controle no traço
    expect(centerlines({ ...SC, type: "DC", quality: 1 })[0]?.pts.length).toBeGreaterThan(
      centerlines({ ...SC, type: "SC", quality: 1 })[0]?.pts.length ?? 0,
    );
    // diminuição (2 pernas) continua no modelo procedural
    expect(centerlines({ ...SC, legs: 2 }).length).toBe(3);
  });

  test("pb no render: trechos não adjacentes do fio ficam afastados de pelo menos 1,5ρ em todas as faixas de fio", () => {
    for (let band = 0; band < RHO_BANDS.length; band++) {
      const spec: ModelSpec = { ...SC, quality: 1, band };
      const rho = RHO_BANDS[band] as number;
      const pts = centerlines(spec)[0]?.pts ?? [];
      let min = Number.POSITIVE_INFINITY;
      for (let a = 0; a < pts.length; a++) {
        for (let b = a + 12; b < pts.length; b++) {
          const p = pts[a] as [number, number, number];
          const q = pts[b] as [number, number, number];
          min = Math.min(min, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
        }
      }
      expect(min).toBeGreaterThanOrEqual(1.5 * rho - 1e-9);
    }
  });

  test("fio contínuo no mundo: a saída do fio do ponto i é a entrada do fio do ponto i+1 (erro < 1e-4), em todas as faixas", () => {
    const { frames, n } = setup();
    const spec: ModelSpec = { ...SC, quality: 1 };
    const pts = centerlines(spec)[0]?.pts ?? [];
    const first = pts[0] as [number, number, number];
    const last = pts[pts.length - 1] as [number, number, number];
    let checked = 0;
    for (let i = 0; i + 1 < n; i++) {
      if (frames.next[i] !== i + 1) continue;
      const out = deformPoint(frames, i, last);
      const inn = deformPoint(frames, i + 1, first);
      expect(Math.hypot(out[0] - inn[0], out[1] - inn[1], out[2] - inn[2])).toBeLessThan(1e-4);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
    // opção por parâmetro (sem estado global): desligar o fio contínuo dá o modelo procedural
    expect(centerlines(spec, undefined, { customStrands: false }).length).toBe(2);
    expect(centerlines(spec).length).toBe(1);
  });
});
