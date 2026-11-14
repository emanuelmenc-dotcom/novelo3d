// SPDX-License-Identifier: GPL-3.0-or-later
// Gráfico v3 (docs/17, casos G9 a G16): faixa de pb seguidos, etiqueta "Nx", tabela "Receita volta a volta" com as repetições
// agrupadas e página de continuação. Os valores do anexo não foram alterados: onde o código produz outra coisa (G12, G14),
// o teste confere o que sai e aponta para as perguntas guardadas 1 e 6 de docs/12. Aguarda aprovação visual (regra 7).
import type { Op, Pattern, Row } from "@novelo/core";
import { describe, expect, test } from "vitest";
import { findRuns, placeTags } from "../src/bands.ts";
import { Svg } from "../src/draw.ts";
import { renderChart } from "../src/index.ts";

const sc = (count: number | "rest"): Op => ({ kind: "stitch", code: "SC", count });
const ch0 = (): Op => ({ kind: "stitch", code: "CH", count: 1, counted: false });
const ch = (): Op => ({ kind: "stitch", code: "CH", count: 1 });
const pbx = (count = 1): Op => ({ kind: "stitch", code: "SL", count, counted: false });
const skip = (): Op => ({ kind: "skip", count: 1 });
const inc = (count: number): Op => ({ kind: "inc", k: 2, count });
const dec = (count: number): Op => ({ kind: "dec", k: 2, count });
const rep = (times: number, ...ops: Op[]): Op => ({ kind: "repeat", times, ops });
const row = (label: string, ops: Op[], extra: Partial<Row> = {}): Row => ({
  label,
  kind: "round",
  ops,
  ...extra,
});
const pat = (...rows: Row[]): Pattern => ({ dialect: "pt-BR", rows });
const BANDS = /stroke-width="5\.0" stroke-linecap="round"/g;
const svg0 = (p: Pattern) => renderChart(p).pages[0]?.svg ?? "";
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

const pBola = (): Pattern =>
  pat(
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
  );

describe("faixa de pb seguidos e etiqueta Nx", () => {
  test("G9: P-BOLA volta 13, (4 pb, 1 dim) x6, não ganha faixa", () => {
    // as voltas 13 a 17 ficam na segunda página: nenhuma sequência chega a 5 pb
    const pages = renderChart(pBola()).pages;
    expect(count(pages[1]?.svg ?? "", BANDS)).toBe(0);
    expect(count(pages[1]?.svg ?? "", /rx="1\.2"/g)).toBe(0); // nenhuma etiqueta Nx
  });

  test("G10: 36 pb com símbolos (pontos pintados na volta 7) têm uma faixa em quase todo o anel e a etiqueta 36x", () => {
    const at = [0, 1, 2, 3, 4, 5].map((index) => ({ row: 7, index }));
    const r = renderChart(pBola(), { paint: [{ kind: "stitches", yarn: "B", at }] });
    const svg = r.pages[0]?.svg ?? "";
    expect(count(svg, BANDS)).toBe(2); // a volta 1 (6 pb) e a volta 7 (36 pb)
    expect(count(svg, />36x</g)).toBeGreaterThanOrEqual(2); // a etiqueta no 1º ponto e o item 36x pb da tabela
    expect(r.pages[0]?.overlaps).toBe(0);
  });

  test("G10b: o anel tracejado das voltas 7–12 não desenha símbolos: só o item 36x pb da tabela", () => {
    // faixa e etiqueta valem para símbolos desenhados (pergunta guardada 9 em docs/12)
    const svg = svg0(pBola());
    expect(count(svg, BANDS)).toBe(1); // só a volta 1
    expect(svg).toContain(">36x<");
  });

  test("G11: 2 pb, 1 aum, 6 pb, 1 aum, 2 pb tem uma faixa só sobre os 6 pb e a etiqueta 6x", () => {
    const p = pat(
      row("1", [inc(6)], { start: "magicRing" }),
      row("2", [sc(2), inc(1), sc(6), inc(1), sc(2)]),
    );
    const svg = svg0(p);
    expect(count(svg, BANDS)).toBe(1);
    expect(count(svg, />6x</g)).toBeGreaterThanOrEqual(2); // a etiqueta da faixa e o item 6x pb da tabela
    // os 6 aumentos da volta 1 são 6 itens (cada aumento tem dois pontos, mas conta uma vez)
    expect(svg).not.toContain(">12x<");
  });

  test("findRuns: só sequências de pb de 5 ou mais, sem atravessar o fim da volta", () => {
    const it = (typ: string) => ({ typ, parents: [], counted: true, a: 0, r: 0 });
    const items = "pb pb pb pb pb dim pb pb pb pb pb pb pb pb pb pb".split(" ").map(it);
    expect(findRuns(items).map((r) => r.length)).toEqual([5, 10]);
    expect(findRuns([it("pb"), it("pb"), it("pb"), it("pb")])).toEqual([]);
  });

  test("G16: duas etiquetas no mesmo ângulo em voltas vizinhas não se sobrepõem", () => {
    const s = new Svg();
    const c: [number, number] = [105, 128];
    const placed = placeTags(
      s,
      c,
      [
        { r: 20, a: 0, txt: "36x", col: "#000" },
        { r: 26.4, a: 0, txt: "36x", col: "#000" },
      ],
      [],
    );
    expect(placed).toHaveLength(2);
    const [a, b] = placed as [[number, number], [number, number]];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(4.4); // largura de uma etiqueta de 3 caracteres
  });

  test("nenhuma sobreposição de símbolos na P-BOLA com faixas e tabela", () => {
    for (const p of renderChart(pBola()).pages) expect(p.overlaps).toBe(0);
  });
});

describe("tabela Receita volta a volta", () => {
  test("G12: P-BOLA volta 3 agrupa em bloco x6 com total (18)", () => {
    // o anexo escreve (1x aum; 1x pb) ×6; a receita do projeto escreve (1 pb, 1 aum) x6 e a ordem da receita vale
    // (pergunta guardada 1 em docs/12)
    const svg = svg0(pBola());
    expect(svg).toContain(">) ×6<");
    expect(svg).toContain(">(18)<");
    expect(svg).toContain("Receita volta a volta");
  });

  test("G13: corr* inicial, bloco com pular e corr, e o fechamento: 1x corr*; (2x pb; 1x corr) ×9; 2x pbx", () => {
    // linha escrita para o projeto (a do anexo vem de uma receita comercial e não entra no repositório);
    // o pular da receita não vira item da tabela (a leitura tem o passo, a tabela não)
    const svg = svg0(
      pat(row("1", [sc(27)], { start: "magicRing" }), row("2", [ch0(), rep(9, sc(2), skip(), ch()), pbx(2)])),
    );
    expect(svg).toContain(">corr*;<");
    expect(svg).toContain(">) ×9;<");
    expect(svg).toContain(">pbx<");
    expect(svg).toContain(">2x<");
  });

  test("G14: o pbx que fecha a volta (join) fica à parte e a corrente inicial de 2 pontos vira 2x corr*", () => {
    // regra do v3.py (período de até 4 corridas): (4 pb; 3 pbx) ×2 dobra, e o pbx de fechamento fica separado do 3 pbx.
    // O anexo espera outra coisa para uma linha parecida (pergunta guardada 6 em docs/12); o valor dele não foi alterado.
    const svg = svg0(
      pat(
        row("1", [sc(24)], { start: "magicRing" }),
        row("2", [
          { kind: "stitch", code: "CH", count: 2, counted: false },
          sc(4),
          pbx(3),
          sc(4),
          pbx(3),
          { kind: "join" },
        ]),
      ),
    );
    expect(svg).toContain(">2x<"); // 2x corr*
    expect(svg).toContain(">corr*;<");
    expect(svg).toContain(">) ×2;<");
    expect(svg).toContain(">1x<"); // o fechamento, sozinho
  });

  test("linha longa quebra em mais de uma linha e a medida confere com o desenho", () => {
    const ops = [
      sc(1),
      inc(1),
      sc(2),
      dec(1),
      sc(3),
      inc(1),
      sc(1),
      dec(1),
      sc(2),
      inc(1),
      sc(4),
      dec(1),
      sc(1),
      inc(1),
    ];
    const r = renderChart(pat(row("1", [sc(24)], { start: "magicRing" }), row("2", ops)));
    const svg = r.pages[0]?.svg ?? "";
    // duas linhas de texto na mesma linha da tabela: os itens passam do limite da primeira linha
    const ys = new Set(
      [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*font-size="2.7"[^>]*>\d+x</g)].map((m) => m[1]),
    );
    expect(ys.size).toBeGreaterThan(2);
    // nenhum texto da tabela termina depois da margem direita
    for (const m of svg.matchAll(/<text x="([\d.]+)"[^>]*font-size="2.7"[^>]*>([^<]*)</g))
      expect(Number(m[1]) + 1.6 * (m[2] ?? "").length).toBeLessThanOrEqual(198);
  });

  test("G15: 18 voltas na página e tabela longa vão para a página de continuação (receita)", () => {
    const rows = [row("1", [sc(6)], { start: "magicRing" }), row("2", [inc(6)])];
    for (let n = 3; n <= 18; n++) rows.push(row(String(n), [rep(6, sc(n - 2), inc(1))]));
    const r = renderChart(pat(...rows), { maxRings: 18 });
    const last = r.pages[r.pages.length - 1];
    expect(last?.label).toContain("(receita)");
    expect(last?.svg).toContain("(receita)");
    expect(last?.svg).toContain("Receita volta a volta");
    // a numeração conta as páginas de continuação
    expect(last?.svg).toContain(`página ${r.pages.length} de ${r.pages.length}`);
    // a página do diagrama fica sem a tabela
    expect(r.pages[0]?.svg).not.toContain("Receita volta a volta");
  });

  test("a P-BOLA cabe com a tabela na mesma página (o diagrama sobe e encolhe)", () => {
    const r = renderChart(pBola());
    expect(r.pages).toHaveLength(2);
    for (const p of r.pages) expect(p.svg).toContain("Receita volta a volta");
  });

  test("a tabela não passa da margem direita (x ≤ 198 mm)", () => {
    for (const p of renderChart(pBola()).pages) {
      for (const m of p.svg.matchAll(/<text x="([\d.]+)"/g)) expect(Number(m[1])).toBeLessThanOrEqual(198);
    }
  });

  test("voltas lisas têm etiqueta cinza, a segunda página marca o ponto de referência e pa e pad saem na tabela", () => {
    const pages = renderChart(pBola()).pages;
    expect(pages[0]?.svg).toContain('fill="#9a9a9a"'); // etiqueta cinza da volta lisa 7–12
    expect(pages[1]?.svg).toContain("ponto de outra volta (referência)");
    const alto = svg0(
      pat(row("1", [sc(12)], { start: "magicRing" }), row("2", [{ kind: "stitch", code: "DC", count: 12 }])),
    );
    expect(alto).toContain(">pa<");
  });

  test("volta lisa que termina em join mostra o pbx de fechamento e não se junta à volta lisa sem ele", () => {
    const base = row("1", [sc(36)], { start: "magicRing" });
    const closed = renderChart(pat(base, row("2", [sc("rest"), { kind: "join" }])));
    expect(closed.pages[0]?.svg).toContain(">pbx<"); // o item 1x pbx do fechamento
    const two = renderChart(pat(base, row("2", [sc("rest"), { kind: "join" }]), row("3", [sc("rest")])));
    // as voltas 2 e 3 só diferem no fechamento: duas linhas, não "2–3"
    expect(two.pages[0]?.svg).not.toContain("2–3");
  });
});
