// SPDX-License-Identifier: GPL-3.0-or-later
// Fechar a montagem (corpo rígido), padrão de fios e costura nas configurações, lista de materiais e troca de fio.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { dispatch, loadEdit, loadPaint, resetPaint, resetParts, resetSettings } from "../src/index.ts";
import { expectReplayMatchesLive } from "./replay-check.ts";

const TEXT = [
  "V1: 6 pb no anel mágico (6)",
  "V2: 6 aum (12)",
  "V3: (1 pb, 1 aum) x6 (18)",
  "V4: (2 pb, 1 aum) x6 (24)",
  "V5: 24 pb (24)",
].join("\n");
const YARNS = [
  { id: "A", name: "a", colorHex: "#5d6b3a" },
  { id: "B", name: "b", colorHex: "#f4f1e8" },
  { id: "C", name: "c", colorHex: "#1565c0" },
];

beforeEach(() => {
  loadPaint({});
  loadEdit({});
  resetParts(TEXT);
  resetSettings();
  dispatch("yarns.set", { yarns: YARNS });
});
afterEach(() => {
  expectReplayMatchesLive();
  loadEdit({});
  resetParts("");
  resetPaint();
  resetSettings();
});

const select = (group: number) =>
  dispatch("selection.select", { text: TEXT, by: { kind: "group", from: group } });
type Lay = {
  nodes: { part: string }[];
  positions: number[];
  seamCurves: { color: string; pairs: number[] }[];
};
const centroid = (lay: Lay, part: string): number[] => {
  const c = [0, 0, 0];
  let n = 0;
  lay.nodes.forEach((nd, i) => {
    if (nd.part !== part) return;
    for (let k = 0; k < 3; k++) c[k] = (c[k] as number) + (lay.positions[i * 3 + k] as number);
    n++;
  });
  return c.map((v) => v / n);
};
const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - (b[i] as number)));

describe("fechar a montagem", () => {
  const setup = (rot: number[]) => {
    dispatch("parts.instance", { id: "p1" });
    dispatch("parts.set", { id: "p2", pos: [20, 15, -9], rot });
    select(5);
    dispatch("seam.draft", { side: "a" });
    dispatch("parts.setActive", { id: "p2" });
    dispatch("seam.draft", { side: "b" });
    dispatch("seam.add", {});
  };
  for (const rot of [
    [0, 0, 0],
    [180, 0, 0],
    [35, -70, 120],
  ]) {
    test(`as bordas se encontram e a peça fica para fora (rotação inicial ${rot.join(",")})`, () => {
      setup(rot);
      const r = dispatch("assembly.close", {}) as {
        gaps: { meanGap: number; maxGap: number }[];
        unconnected: string[];
      };
      expect(r.unconnected).toEqual([]);
      expect(r.gaps[0]?.maxGap).toBeLessThan(0.05);
      const lay = dispatch("assembly.layout", {}) as Lay;
      const c1 = centroid(lay, "p1");
      const c2 = centroid(lay, "p2");
      // bordas coincidem e os dois corpos ficam em lados opostos: a distância dos centros é ~2x a do centro à borda
      const ids = lay.seamCurves[0]?.pairs ?? [];
      const rimCenter = [0, 1, 2].map(
        (k) => ids.reduce((sum, i) => sum + (lay.positions[i * 3 + k] as number), 0) / ids.length,
      );
      const toRim = dist(c1, rimCenter);
      expect(dist(c1, c2)).toBeGreaterThan(toRim * 1.8);
    });
  }

  test("peça dentro de uma montagem fora da origem e girada também encosta (pergunta 14 em docs/12)", () => {
    setup([0, 0, 0]);
    dispatch("assembly.add", { parts: ["p2"] });
    dispatch("assembly.set", { id: "a1", pos: [30, -12, 7], rot: [20, 45, -60] });
    const r = dispatch("assembly.close", {}) as { gaps: { maxGap: number }[] };
    expect(r.gaps[0]?.maxGap).toBeLessThan(0.05);
  });

  test("devolve as poses de antes; peça sem costura fica onde estava; âncora inexistente é erro", () => {
    setup([0, 0, 0]);
    dispatch("parts.add", { name: "Solta", text: TEXT });
    const r = dispatch("assembly.close", {}) as {
      before: Record<string, { pos: number[] }>;
      unconnected: string[];
    };
    expect(r.before.p2?.pos).toEqual([20, 15, -9]);
    expect(r.unconnected).toEqual(["p3"]);
    expect(() => dispatch("assembly.close", { anchor: "zz" })).toThrow(/não existe/);
  });

  test("contornos de tamanhos diferentes deixam folga, avisada", () => {
    const small = "V1: 6 pb no anel mágico (6)\nV2: 6 aum (12)";
    dispatch("parts.add", { name: "Pequena", text: small });
    dispatch("parts.set", { id: "p2", pos: [20, 0, 0] });
    select(5);
    dispatch("seam.draft", { side: "a" });
    dispatch("parts.setActive", { id: "p2" });
    dispatch("selection.select", { text: small, by: { kind: "group", from: 2 } });
    dispatch("seam.draft", { side: "b" });
    dispatch("seam.add", { ratio: [2, 1] });
    const r = dispatch("assembly.close", {}) as { gaps: { meanGap: number }[]; warnings: string[] };
    expect(r.gaps[0]?.meanGap).toBeGreaterThan(0.5);
    expect(r.warnings.join(" ")).toMatch(/rígidas/);
  });
});

describe("padrão de fios e costura", () => {
  test("fio novo segue o padrão das configurações com cor diferente", () => {
    dispatch("settings.set", {
      yarns: {
        standard: { colorKind: "gradient", segmentM: 12, material: "algodao", thickness: { id: "cyc-4" } },
        seam: { colorHex: "#00aa00", type: "whip" },
      },
    });
    type Out = {
      id: string;
      yarns: {
        id: string;
        colorHex: string;
        color?: { kind: string; segmentM: number };
        material?: string;
      }[];
    };
    const a = dispatch("yarns.add", {}) as Out;
    const b = dispatch("yarns.add", {}) as Out;
    expect(a.id).toBe("D");
    expect(b.id).toBe("E");
    const d = a.yarns.find((y) => y.id === "D");
    const e = b.yarns.find((y) => y.id === "E");
    expect(d).toMatchObject({ material: "algodao", color: { kind: "gradient", segmentM: 12 } });
    expect(e?.colorHex).not.toBe(d?.colorHex);
    expect(dispatch("settings.get")).toMatchObject({
      yarns: { seam: { colorHex: "#00aa00", type: "whip" } },
    });
  });

  test("seam.add usa o tipo padrão; a curva usa a cor da costura; valores inválidos são recusados", () => {
    dispatch("settings.set", { yarns: { seam: { colorHex: "#00aa00", type: "slip" } } });
    dispatch("parts.instance", { id: "p1" });
    select(5);
    dispatch("seam.draft", { side: "a" });
    dispatch("parts.setActive", { id: "p2" });
    dispatch("seam.draft", { side: "b" });
    dispatch("seam.add", {});
    expect((dispatch("seam.list") as { seams: { type: string }[] }).seams[0]?.type).toBe("slip");
    const lay = dispatch("assembly.layout", {}) as Lay;
    expect(lay.seamCurves[0]?.color).toBe("#00aa00");
    expect(() => dispatch("settings.set", { yarns: { seam: { colorHex: "verde" } } })).toThrow(/#rrggbb/);
    expect(() => dispatch("settings.set", { yarns: { standard: { colorKind: "xadrez" } } })).toThrow(
      /tipo de cor/,
    );
    expect(() => dispatch("settings.set", { yarns: { standard: { material: "seda" } } })).toThrow(/material/);
    dispatch("settings.set", { yarns: { standard: { material: null } } });
    const s = dispatch("settings.get") as { yarns: { standard: { material?: string } } };
    expect(s.yarns.standard.material).toBeUndefined();
  });
});

describe("lista de materiais", () => {
  test("soma o consumo de todas as peças (instância gasta fio) e separa por peça", () => {
    dispatch("paint.rows", { yarn: "B", from: 3, to: 4 });
    dispatch("parts.instance", { id: "p1" });
    dispatch("parts.set", { id: "p2", yarnMap: { B: "C" } });
    const l = dispatch("materials.list") as {
      yarns: { id: string; stitches: number; used: boolean; parts: { id: string }[] }[];
    };
    const y = (id: string) => l.yarns.find((q) => q.id === id) as (typeof l.yarns)[number];
    expect(y("B").stitches).toBe(42); // voltas 3 e 4 só na original
    expect(y("C").stitches).toBe(42); // a instância troca B por C
    expect(y("B").parts.map((q) => q.id)).toEqual(["p1"]);
    expect(y("C").parts.map((q) => q.id)).toEqual(["p2"]);
    expect(y("A").used).toBe(true);
  });

  test("trocar B por C em todo o projeto: pintura, pontos pintados e instâncias; remover B", () => {
    dispatch("paint.rows", { yarn: "B", from: 3, to: 3 });
    select(4);
    dispatch("points.set", { text: TEXT, prop: "yarn", value: "B" });
    dispatch("parts.instance", { id: "p1" });
    dispatch("parts.set", { id: "p2", yarnMap: { B: "A" } });
    const r = dispatch("materials.replace", { from: "B", to: "C", remove: true }) as {
      changed: number;
      yarns: { id: string }[];
    };
    expect(r.changed).toBeGreaterThanOrEqual(3);
    expect(r.yarns.map((q) => q.id)).toEqual(["A", "C"]);
    const dropper = dispatch("tool.eyedropper", { text: TEXT, uid: 50, prop: "yarn" }) as { value: string };
    expect(dropper.value).toBe("C");
    const l = dispatch("materials.list") as { yarns: { id: string; stitches: number }[] };
    expect(l.yarns.find((q) => q.id === "C")?.stitches).toBeGreaterThanOrEqual(18 + 24);
    const parts = dispatch("parts.get") as { parts: { yarnMap: Record<string, string> | null }[] };
    expect(parts.parts[1]?.yarnMap).toEqual({ C: "A" });
  });

  test("trocar o fio A faz o A assumir as propriedades do outro; erros claros", () => {
    dispatch("paint.rows", { yarn: "C", from: 2, to: 2 });
    dispatch("materials.replace", { from: "A", to: "C" });
    const ys = (dispatch("yarns.get") as { yarns: { id: string; colorHex: string }[] }).yarns;
    expect(ys.find((q) => q.id === "A")?.colorHex).toBe("#1565c0");
    expect(() => dispatch("materials.replace", { from: "B", to: "B" })).toThrow(/diferente/);
    expect(() => dispatch("materials.replace", { from: "B", to: "Z" })).toThrow(/não existe/);
    expect(() => dispatch("materials.replace", { from: "Q", to: "A" })).toThrow(/não existe/);
  });

  test("remover um fio ainda usado por outra peça é recusado", () => {
    dispatch("parts.copy", { id: "p1" });
    dispatch("parts.setActive", { id: "p2" });
    dispatch("paint.rows", { yarn: "B", from: 2, to: 2 });
    dispatch("parts.setActive", { id: "p1" });
    expect(() => dispatch("yarns.set", { yarns: [YARNS[0], YARNS[2]] })).toThrow(/ainda é usado/);
  });
});
