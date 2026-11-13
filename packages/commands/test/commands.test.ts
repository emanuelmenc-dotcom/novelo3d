// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, expect, test } from "vitest";
import { dispatch, loadPaint, paintSnapshot, resetPaint } from "../src/index.ts";

test("system.ping responde", () => {
  expect(dispatch("system.ping")).toEqual({ pong: true });
});
test("comando desconhecido lança erro claro", () => {
  expect(() => dispatch("nao.existe")).toThrow(/desconhecido/);
});
test("interop.parseDot conta nós e arestas", () => {
  const r = dispatch("interop.parseDot", { text: '3\n"a" {0,0,0}\n"b" {1,0,0}\n"a" -- "b" 1\n' });
  expect(r).toMatchObject({ ok: true, nodes: 2, edges: 1 });
});

const P_BOLA = [
  "V1: 6 pb no anel mágico (6)",
  "V2: 6 aum (12)",
  "V3: (1 pb, 1 aum) x6 (18)",
  "V4: (2 pb, 1 aum) x6 (24)",
  "V5: (3 pb, 1 aum) x6 (30)",
  "V6: (4 pb, 1 aum) x6 (36)",
  "V7–12: 1 pb em cada ponto (36)",
  "V13: (4 pb, 1 dim) x6 (30)",
  "V14: (3 pb, 1 dim) x6 (24)",
  "V15: (2 pb, 1 dim) x6 (18)",
  "V16: (1 pb, 1 dim) x6 (12)",
  "V17: 6 dim (6)",
].join("\n");

test("pattern.verify: P-BOLA válida e com total 19 em V3 apanhado", () => {
  const ok = dispatch("pattern.verify", { text: P_BOLA }) as { ok: boolean; totalCounted: number };
  expect(ok).toMatchObject({ ok: true, totalCounted: 432 });
  const bad = dispatch("pattern.verify", { text: P_BOLA.replace("(18)", "(19)") }) as {
    ok: boolean;
    table: { status: string }[];
  };
  expect(bad.ok).toBe(false);
  expect(bad.table[2]?.status).toBe("Total declarado errado");
});

test("pattern.print converte de dialeto e pattern.toCp / fromCp fecham o ciclo", () => {
  const uk = dispatch("pattern.print", { text: P_BOLA, to: "en-UK" }) as { text: string };
  expect(uk.text.split("\n")[0]).toBe("Round 1: 6 dc in magic ring (6)");
  const cp = dispatch("pattern.toCp", { text: P_BOLA }) as { text: string };
  const back = dispatch("pattern.fromCp", { text: cp.text }) as {
    ok: boolean;
    totalCounted: number;
    text: string;
  };
  expect(back).toMatchObject({ ok: true, totalCounted: 432 });
  expect(back.text).toBe(P_BOLA);
});

test("chart.render: 2 páginas sem sobreposição", () => {
  const r = dispatch("chart.render", { text: P_BOLA }) as { pages: { overlaps: number }[] };
  expect(r.pages).toHaveLength(2);
  expect(r.pages.every((p) => p.overlaps === 0)).toBe(true);
});

test("dialeto inválido gera erro claro", () => {
  expect(() => dispatch("pattern.parse", { text: "x", dialect: "fr" })).toThrow(/inválido/);
});

test("graph.layout: resumo da bola e posições completas sob pedido", () => {
  const r = dispatch("graph.layout", { text: P_BOLA }) as {
    stats: { nodes: number; meanEdge: number };
    positions?: number[];
  };
  expect(r.stats.nodes).toBe(433);
  expect(r.stats.meanEdge).toBeCloseTo(1, 2);
  expect(r.positions).toBeUndefined();
  const full = dispatch("graph.layout", { text: P_BOLA, include: true }) as {
    positions: number[];
    nodes: { id: number }[];
    edges: number[];
  };
  expect(full.positions).toHaveLength(433 * 3);
  expect(full.nodes).toHaveLength(433);
  expect(full.edges.length % 2).toBe(0);
});

test("receita -> grafo -> contagens: o grafo tem as mesmas 17 contagens da receita", () => {
  const v = dispatch("pattern.verify", { text: P_BOLA }) as { counts: number[] };
  const g = dispatch("graph.layout", { text: P_BOLA }) as { rows: { first: number; last: number }[] };
  expect(g.rows.map((r) => r.last - r.first + 1)).toEqual(v.counts);
});

afterEach(() => resetPaint());

type Report = {
  changes: { round: number; from: string | null; to: string; atStitch: number }[];
  changeCount: number;
  recipe: string;
  usage: { yarn: string; stitches: number; share: number; lengthM: number; name: string }[];
  issues: { code: string }[];
};

test("paint.rows + paint.report: pintar 3 voltas gera as trocas nas linhas certas e o consumo", () => {
  dispatch("paint.rows", { yarn: "B", from: 7, to: 9 });
  const r = dispatch("paint.report", { text: P_BOLA }) as Report;
  expect(r.changeCount).toBe(2);
  expect(r.changes.map((c) => [c.round, c.from, c.to])).toEqual([
    [7, "A", "B"],
    [10, "B", "A"],
  ]);
  const lines = r.recipe.split("\n");
  expect(lines[6]).toBe("V7–9: trocar para o fio B (off white), 1 pb em cada ponto (36)");
  expect(lines[7]).toBe("V10–12: trocar para o fio A (verde musgo), 1 pb em cada ponto (36)");
  const b = r.usage.find((u) => u.yarn === "B");
  expect(b).toMatchObject({ stitches: 108, name: "off white" });
  expect(b?.share).toBeCloseTo(0.25, 5);
  expect(b?.lengthM).toBeGreaterThan(0);
});

test("a pintura do projeto também chega ao gráfico e ao 3D, sem mexer nas posições", () => {
  const before = dispatch("graph.layout", { text: P_BOLA, include: true, seed: 3 }) as {
    positions: number[];
    nodes: { yarn: string }[];
  };
  dispatch("paint.rows", { yarn: "B", from: 7, to: 9 });
  const chart = dispatch("chart.render", { text: P_BOLA }) as { pages: { yarns: string[] }[] };
  expect(chart.pages[0]?.yarns).toEqual(["A", "B"]);
  const after = dispatch("graph.layout", { text: P_BOLA, include: true, seed: 3 }) as {
    positions: number[];
    nodes: { yarn: string }[];
    palette: Record<string, string>;
  };
  expect(after.positions).toEqual(before.positions); // C2: a pintura não depende das posições
  expect(after.nodes.filter((n) => n.yarn === "B")).toHaveLength(108);
  expect(before.nodes.filter((n) => n.yarn === "B")).toHaveLength(0);
  expect(after.palette).toEqual({ A: "#5d6b3a", B: "#f4f1e8" });
});

test("paleta: novo fio, pintura com ele, e não deixa tirar um fio em uso", () => {
  const set = dispatch("yarns.set", {
    yarns: [
      { id: "A", name: "verde musgo", colorHex: "#5d6b3a" },
      { id: "B", name: "off white", colorHex: "#f4f1e8" },
      { id: "C", name: "laranja", colorHex: "#e8590c" },
    ],
  }) as { yarns: unknown[] };
  expect(set.yarns).toHaveLength(3);
  expect((dispatch("yarns.get") as { nextId: string }).nextId).toBe("D");
  dispatch("paint.stitches", { yarn: "C", at: [{ row: 7, index: 0 }] });
  expect(() =>
    dispatch("yarns.set", {
      yarns: [
        { id: "A", name: "x", colorHex: "#000000" },
        { id: "B", name: "y", colorHex: "#ffffff" },
      ],
    }),
  ).toThrow(/ainda é usado/);
  const rep = dispatch("paint.report", { text: P_BOLA }) as Report;
  expect(rep.usage.some((u) => u.yarn === "C" && u.name === "laranja")).toBe(true);
});

test("paint.report aceita fios e pintura explícitos, sem tocar no projeto", () => {
  const r = dispatch("paint.report", {
    text: P_BOLA,
    yarns: [
      { id: "A", name: "azul", colorHex: "#1f3a5f" },
      { id: "B", name: "amarelo", colorHex: "#f2c94c" },
    ],
    paint: [{ kind: "rows", yarn: "B", from: 13, to: 17 }],
    to: "en-US",
  }) as Report;
  expect(r.recipe.split("\n")[7]).toBe("Rnd 13: change to yarn B (amarelo), (4 sc, 1 dec) x6 (30)");
  expect(paintSnapshot().paint).toEqual([]);
});

test("erros claros: fio inexistente, faixa invertida, índice inexistente, pintura fora das voltas", () => {
  expect(() => dispatch("paint.rows", { yarn: "Z", from: 1, to: 2 })).toThrow(/paleta/);
  expect(() => dispatch("paint.rows", { yarn: "B", from: 5, to: 2 })).toThrow(/faixa/);
  expect(() => dispatch("paint.remove", { index: 3 })).toThrow(/não existe/);
  dispatch("paint.rows", { yarn: "B", from: 30, to: 40 });
  const r = dispatch("paint.report", { text: P_BOLA }) as Report;
  expect(r.issues.map((i) => i.code)).toContain("PAINT_OUT_OF_RANGE");
  expect(r.changeCount).toBe(0); // região ignorada, não apagada
  expect(paintSnapshot().paint).toHaveLength(1);
  dispatch("paint.remove", { index: 0 });
  expect(paintSnapshot().paint).toHaveLength(0);
});

test("carregar do navegador: descarta paleta e regiões inválidas sem lançar erro", () => {
  const s = loadPaint({
    yarns: [{ id: "A", name: "x", colorHex: "#123456" }],
    paint: [{ kind: "rows", yarn: "A", from: 1, to: 2 }, { kind: "rows", yarn: "Q", from: 1, to: 2 }, "lixo"],
  });
  expect(s.paint).toHaveLength(1);
  expect(loadPaint(undefined).yarns).toHaveLength(2);
});
