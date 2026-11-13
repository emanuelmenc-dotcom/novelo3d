// SPDX-License-Identifier: GPL-3.0-or-later
// Gráfico circular da P-BOLA: páginas, símbolos, sem sobreposição, SVG bem formado.
import type { Op, Pattern, Row } from "@novelo/core";
import { describe, expect, test } from "vitest";
import { renderChart } from "../src/index.ts";

const sc = (count: number | "rest"): Op => ({ kind: "stitch", code: "SC", count });
const inc = (count: number): Op => ({ kind: "inc", k: 2, count });
const dec = (count: number): Op => ({ kind: "dec", k: 2, count });
const rep = (times: number, ...ops: Op[]): Op => ({ kind: "repeat", times, ops });
const row = (label: string, ops: Op[], extra: Partial<Row> = {}): Row => ({
  label,
  kind: "round",
  ops,
  ...extra,
});

const pBola = (): Pattern => ({
  dialect: "pt-BR",
  rows: [
    row("1", [sc(6)], { start: "magicRing" }),
    row("2", [inc(6)]),
    row("3", [rep(6, sc(1), inc(1))]),
    row("4", [rep(6, sc(2), inc(1))]),
    row("5", [rep(6, sc(3), inc(1))]),
    row("6", [rep(6, sc(4), inc(1))]),
    row("7–12", [sc("rest")], { repeatRows: 6 }),
    row("13", [rep(6, sc(4), dec(1))]),
    row("14", [rep(6, sc(3), dec(1))]),
    row("15", [rep(6, sc(2), dec(1))]),
    row("16", [rep(6, sc(1), dec(1))]),
    row("17", [dec(6)]),
  ],
});

describe("gráfico circular", () => {
  const r = renderChart(pBola());

  test("a bola vira duas páginas: crescendo e fechando (de fora para dentro)", () => {
    expect(r.pages).toHaveLength(2);
    expect(r.pages[0]?.label).toBe("voltas 1–12");
    expect(r.pages[1]?.label).toBe("voltas 13–17");
    expect(r.pages[1]?.symbols).toContain("ref");
  });

  test("nenhuma sobreposição de símbolos", () => {
    for (const p of r.pages) expect(p.overlaps).toBe(0);
  });

  test("símbolos e marcas esperados", () => {
    expect(r.pages[0]?.symbols).toEqual(expect.arrayContaining(["am", "pb", "aum", "liso", "ini", "fim"]));
    expect(r.pages[1]?.symbols).toEqual(expect.arrayContaining(["dim", "ref", "fim"]));
  });

  test("SVG A4 bem formado e com acentos", () => {
    for (const p of r.pages) {
      expect(p.svg).toContain('viewBox="0 0 210 297"');
      expect(p.svg.match(/<svg/g)).toHaveLength(1);
      expect(p.svg).toContain("</svg>");
      expect(p.svg).not.toContain("NaN");
      expect(p.svg).toContain("Gráfico circular");
    }
    expect(r.pages[1]?.svg).toContain("de fora para dentro");
  });

  test("versão padrão: traço preto e sem total por volta", () => {
    const std = renderChart(pBola(), { beginner: false });
    expect(std.pages[0]?.svg).not.toContain("#1b4f8a");
    expect(std.pages[0]?.svg).not.toMatch(/>\(\d+\)</);
    expect(r.pages[0]?.svg).toMatch(/>\(\d+\)</);
  });

  test("é determinístico", () => {
    expect(renderChart(pBola()).pages[0]?.svg).toBe(r.pages[0]?.svg);
  });
});

describe("gráfico com fios pintados", () => {
  const paint = [{ kind: "rows" as const, yarn: "B", from: 7, to: 9 }];

  test("sem pintura não há cartões nem halos", () => {
    const r = renderChart(pBola());
    expect(r.pages.every((p) => p.yarns.length === 0)).toBe(true);
    expect(r.pages[0]?.svg).not.toContain("Fio ");
    expect(r.pages[0]?.svg).not.toContain('fill-opacity="0.6"');
  });

  test("G5: fio B nas voltas 7 a 9 mostra dois cartões de fio e anéis lisos separados por fio", () => {
    const r = renderChart(pBola(), { paint });
    const p1 = r.pages[0];
    expect(p1?.yarns).toEqual(["A", "B"]);
    expect(p1?.svg).toContain("Fio A");
    expect(p1?.svg).toContain("Fio B");
    expect(p1?.svg).toContain("off white");
    expect(p1?.svg).toContain("verde musgo");
    expect(p1?.svg).toContain("7–9 · 36 pb");
    expect(p1?.svg).toContain("10–12 · 36 pb");
    expect(p1?.svg).toContain("marcam os pontos que não são do fio A");
    // a segunda página (voltas 13 a 17) só usa o fio A
    expect(r.pages[1]?.yarns).toEqual(["A"]);
    for (const p of r.pages) expect(p.overlaps).toBe(0);
  });

  test("pontos pintados dentro de uma volta lisa: a volta passa a mostrar os símbolos com halo", () => {
    const at = [0, 1, 2, 3, 4, 5].map((index) => ({ row: 7, index }));
    const r = renderChart(pBola(), { paint: [{ kind: "stitches", yarn: "B", at }] });
    const p1 = r.pages[0];
    expect(p1?.symbols).toContain("pb");
    // só os 6 pontos do fio B recebem halo (o fio A, base, fica limpo)
    expect((p1?.svg.match(/fill-opacity="0.6"/g) ?? []).length).toBe(6);
    expect(p1?.svg).toContain("8–12 · 36 pb"); // o resto continua anel liso
    expect(p1?.overlaps).toBe(0);
  });

  test("paleta própria: nome e cor aparecem no cartão", () => {
    const r = renderChart(pBola(), {
      paint,
      yarns: [
        { id: "A", name: "azul marinho", colorHex: "#1f3a5f" },
        { id: "B", name: "amarelo", colorHex: "#f2c94c" },
      ],
    });
    expect(r.pages[0]?.svg).toContain("azul marinho");
    expect(r.pages[0]?.svg).toContain("#f2c94c");
  });
});
