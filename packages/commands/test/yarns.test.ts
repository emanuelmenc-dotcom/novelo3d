// SPDX-License-Identifier: GPL-3.0-or-later
// Biblioteca de fios pelos comandos: yarns.library, yarns.preview, relatório com espessura e cor no layout 3D.
import { afterEach, beforeEach, expect, test } from "vitest";
import { dispatch, loadEdit, loadPaint, resetPaint } from "../src/index.ts";
import { expectReplayMatchesLive } from "./replay-check.ts";

const text = [
  "V1: 6 pb no anel mágico (6)",
  "V2: 6 aum (12)",
  "V3: (1 pb, 1 aum) x6 (18)",
  "V4: 18 pb (18)",
].join("\n");

beforeEach(() => {
  loadEdit({});
  loadPaint({});
});
afterEach(() => {
  expectReplayMatchesLive();
  loadEdit({});
  resetPaint();
});

type Node = { row: number; uid: number; yarn: string; size: number; scale: number; color?: string };
type Lay = { nodes: Node[] };

test("yarns.library lista tipos de cor, materiais e espessuras das três regiões", () => {
  const lib = dispatch("yarns.library") as {
    colorKinds: { id: string }[];
    materials: { id: string }[];
    thickness: { id: string; region: string }[];
    note: string;
  };
  expect(lib.colorKinds.map((k) => k.id)).toEqual(["solid", "stripes", "gradient", "melange", "tweed"]);
  expect(lib.materials).toHaveLength(6);
  expect(new Set(lib.thickness.map((t) => t.region))).toEqual(new Set(["eua", "uk-eu", "br"]));
  expect(lib.note).toMatch(/aproximados/);
});

test("yarns.preview acompanha o tipo de cor", () => {
  const r = dispatch("yarns.preview", {
    yarn: {
      id: "A",
      name: "x",
      colorHex: "#000000",
      color: { kind: "stripes", colors: ["#ff0000", "#0000ff"], segmentM: 10 },
    },
    meters: 40,
    steps: 4,
  }) as { colors: string[] };
  expect(r.colors).toEqual(["#ff0000", "#0000ff", "#ff0000", "#0000ff"]);
  expect(() => dispatch("yarns.preview", { yarn: "Z" })).toThrow(/não existe/);
});

test("listras por comprimento colorem os pontos do 3D na ordem do fio", () => {
  dispatch("yarns.set", {
    yarns: [
      {
        id: "A",
        name: "a",
        colorHex: "#ff0000",
        color: { kind: "stripes", colors: ["#ff0000", "#0000ff"], segmentM: 0.2 },
      },
    ],
  });
  const lay = dispatch("graph.layout", { text, include: true }) as Lay;
  const colors = lay.nodes.filter((n) => n.row >= 0).map((n) => n.color);
  expect(new Set(colors)).toEqual(new Set(["#ff0000", "#0000ff"]));
  // o primeiro trecho (primeiros pontos) é vermelho e depois troca
  expect(colors[0]).toBe("#ff0000");
  expect(colors.indexOf("#0000ff")).toBeGreaterThan(3);
});

test("fio mais grosso aumenta o tamanho dos pontos, o consumo e o espaço no layout", () => {
  dispatch("yarns.set", {
    yarns: [
      { id: "A", name: "fino", colorHex: "#5d6b3a", thickness: { id: "cyc-3" } },
      { id: "B", name: "grosso", colorHex: "#f4f1e8", thickness: { id: "cyc-5" }, material: "mohair" },
    ],
  });
  dispatch("paint.rows", { yarn: "B", from: 3, to: 4 });
  const lay = dispatch("graph.layout", { text, include: true }) as Lay;
  const a = lay.nodes.find((n) => n.row === 0) as Node;
  const b = lay.nodes.find((n) => n.row === 3) as Node;
  expect(a.size).toBeCloseTo(1);
  expect(b.size).toBeCloseTo(1.75);
  expect(b.scale).toBeCloseTo(1.75 * 1.14);
  type Usage = {
    yarn: string;
    lengthM: number;
    diameterMm: number;
    material: string | null;
    gramsApprox: number | null;
  };
  const rep = dispatch("paint.report", { text }) as { usage: Usage[] };
  const ub = rep.usage.find((u) => u.yarn === "B") as Usage;
  expect(ub).toMatchObject({ diameterMm: 3.5, material: "Mohair" });
  expect(ub.gramsApprox).toBeGreaterThan(0);
  // sem espessura informada, o mesmo fio B gasta 1/1,75 desse comprimento
  dispatch("yarns.set", {
    yarns: [
      { id: "A", name: "fino", colorHex: "#5d6b3a" },
      { id: "B", name: "g", colorHex: "#f4f1e8" },
    ],
  });
  const plain = dispatch("paint.report", { text }) as { usage: Usage[] };
  expect(ub.lengthM).toBeGreaterThan((plain.usage.find((u) => u.yarn === "B")?.lengthM as number) * 1.5);
});

test("yarns.set recusa espessura desconhecida sem alterar a paleta", () => {
  const before = JSON.stringify(dispatch("yarns.get"));
  expect(() =>
    dispatch("yarns.set", {
      yarns: [{ id: "A", name: "a", colorHex: "#5d6b3a", thickness: { id: "nao-existe" } }],
    }),
  ).toThrow(/desconhecido/);
  expect(JSON.stringify(dispatch("yarns.get"))).toBe(before);
});

test("anel e corrente não geram variantes duplicadas por pernas", () => {
  const lay = dispatch("graph.layout", { text, include: true }) as unknown as { geoms: string[] };
  expect(lay.geoms.filter((k) => k.startsWith("RING@")).every((k) => k.includes("|L1|"))).toBe(true);
  expect(lay.geoms.filter((k) => k.startsWith("RING@"))).toHaveLength(1);
});
