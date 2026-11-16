// SPDX-License-Identifier: GPL-3.0-or-later
// Medidas (G7): measure.bounds e measure.distance são consultas (nunca features) e valem em larguras de ponto e em mm
// estimados. Os testes conferem relações, não valores de referência inventados.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { dispatch, resetParts, resetSettings, timelineView } from "../src/index.ts";

const BOLA = [
  "V1: 6 pb no anel mágico (6)",
  "V2: 6 aum (12)",
  "V3: (1 pb, 1 aum) x6 (18)",
  "V4: (2 pb, 1 aum) x6 (24)",
  "V5: (3 pb, 1 aum) x6 (30)",
  "V6: (4 pb, 1 aum) x6 (36)",
  "V7-12: 1 pb em cada ponto (36)",
  "V13: (4 pb, 1 dim) x6 (30)",
  "V14: (3 pb, 1 dim) x6 (24)",
  "V15: (2 pb, 1 dim) x6 (18)",
  "V16: (1 pb, 1 dim) x6 (12)",
  "V17: 6 dim (6)",
].join("\n");
interface Bounds {
  size: number[];
  sizeMm: number[];
  min: number[];
  max: number[];
  nodes: number;
  stitchWidthMm: number;
  estimate: boolean;
}
const bounds = (p: Record<string, unknown> = {}) => dispatch("measure.bounds", p) as Bounds;
const refused = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return "ok";
};

beforeEach(() => resetParts(BOLA));
afterEach(() => {
  resetSettings();
  resetParts("");
});

describe("measure.bounds", () => {
  test("a bola é mais ou menos uma esfera: altura perto do diâmetro; é estimativa", () => {
    const b = bounds();
    expect(b.estimate).toBe(true);
    const [x, y, z] = b.size as [number, number, number];
    expect(Math.abs(x - y) / Math.max(x, y)).toBeLessThan(0.1); // simétrica em volta do eixo
    expect(z / x).toBeGreaterThan(0.75);
    expect(z / x).toBeLessThan(1.25);
  });

  test("dobrar a largura do ponto dobra os mm e não muda as larguras de ponto", () => {
    const a = bounds();
    dispatch("settings.set", { yarns: { stitchWidthMm: a.stitchWidthMm * 2 } });
    const b = bounds();
    expect(b.size).toEqual(a.size);
    for (let i = 0; i < 3; i++) expect(b.sizeMm[i]).toBeCloseTo((a.sizeMm[i] as number) * 2, 0);
  });

  test("mover a montagem não muda o tamanho, só onde está", () => {
    dispatch("assembly.add", { parts: ["p1"] });
    const a = bounds({ target: "assembly", id: "a1" });
    dispatch("assembly.set", { id: "a1", pos: [40, 0, 0] });
    const b = bounds({ target: "assembly", id: "a1" });
    expect(b.size).toEqual(a.size);
    // a posição é em mm; o tamanho medido é em larguras de ponto de 5 mm
    expect(b.min[0]).toBeCloseTo((a.min[0] as number) + 40 / 5, 2);
  });

  test("peça escondida não entra na medida; sem nada à vista é erro claro", () => {
    dispatch("parts.instance", { id: "p1" });
    dispatch("parts.set", { id: "p2", pos: [60, 0, 0] });
    const all = bounds();
    const one = bounds({ target: "part", id: "p1" });
    expect(all.size[0]).toBeGreaterThan((one.size[0] as number) * 1.5);
    dispatch("parts.setVisible", { id: "p2", visible: false });
    expect(bounds().size).toEqual(one.size);
    dispatch("parts.setVisible", { id: "p1", visible: false });
    expect(refused(() => bounds())).toContain("não há pontos à vista");
  });

  test("alvo inválido é recusado", () => {
    expect(refused(() => bounds({ target: "volta" }))).toContain("all, part ou assembly");
    expect(refused(() => bounds({ target: "part", id: "zzz" }))).toContain("não existe");
  });
});

describe("measure.distance", () => {
  const pt = (uid: number) => ({ part: "p1", uid });
  test("distância de um ponto a ele mesmo é zero e é simétrica", () => {
    expect(dispatch("measure.distance", { a: pt(10), b: pt(10) })).toMatchObject({
      distance: 0,
      distanceMm: 0,
    });
    const ab = dispatch("measure.distance", { a: pt(3), b: pt(30) }) as { distance: number };
    const ba = dispatch("measure.distance", { a: pt(30), b: pt(3) }) as { distance: number };
    expect(ab.distance).toBeGreaterThan(0);
    expect(ab.distance).toBe(ba.distance);
  });

  test("os mm acompanham a largura do ponto", () => {
    const a = dispatch("measure.distance", { a: pt(3), b: pt(30) }) as { distanceMm: number };
    dispatch("settings.set", { yarns: { stitchWidthMm: 10 } });
    const b = dispatch("measure.distance", { a: pt(3), b: pt(30) }) as { distanceMm: number };
    expect(b.distanceMm).toBeGreaterThan(a.distanceMm);
  });

  test("entre os pontos mais à esquerda e mais à direita a distância é pelo menos a largura de measure.bounds", () => {
    const lay = dispatch("assembly.layout", {}) as unknown as {
      nodes: { part: string; uid: number }[];
      positions: number[];
    };
    let lo = 0;
    let hi = 0;
    lay.nodes.forEach((_, i) => {
      if ((lay.positions[i * 3] as number) < (lay.positions[lo * 3] as number)) lo = i;
      if ((lay.positions[i * 3] as number) > (lay.positions[hi * 3] as number)) hi = i;
    });
    const a = lay.nodes[lo] as { part: string; uid: number };
    const b = lay.nodes[hi] as { part: string; uid: number };
    const d = dispatch("measure.distance", { a, b }) as { distance: number };
    // dentro do arredondamento (3 casas) de cada comando
    expect(d.distance).toBeGreaterThanOrEqual(bounds().size[0] as number);
    expect(d.distance).toBeCloseTo(bounds().size[0] as number, 1);
  });

  test("ponto fora da vista ou parâmetro ruim é recusado", () => {
    expect(
      refused(() => dispatch("measure.distance", { a: pt(3), b: { part: "p1", uid: 99999 } })),
    ).toContain("não está à vista");
    expect(refused(() => dispatch("measure.distance", { a: 5, b: pt(3) }))).toContain("{part, uid}");
  });
});

test("medir é consulta: não entra na linha do tempo", () => {
  dispatch("measure.bounds", {});
  dispatch("measure.distance", { a: { part: "p1", uid: 3 }, b: { part: "p1", uid: 30 } });
  expect(timelineView().features).toEqual([]);
});
