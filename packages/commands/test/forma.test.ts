// SPDX-License-Identifier: GPL-3.0-or-later
// Receita a partir de forma pelo comando (P5a): forward.revolve gera texto que o leitor de receitas aceita com as mesmas
// contagens, usa a largura e a altura das configurações, liga as contagens amigáveis no modo iniciante e não muda o projeto.
import { afterEach, expect, test } from "vitest";
import { dispatch, resetSettings, timelineView } from "../src/index.ts";

type Out = {
  text: string;
  counts: number[];
  total: number;
  gauge: { w: number; h: number };
  issues: { code: string }[];
};
const F1 = { kind: "sphere", radius: (36 * 5) / (2 * Math.PI) };
const H6 = (6 / (2 * Math.PI)) * 5;

afterEach(() => resetSettings());

test("a esfera F1 vira texto em pt-BR que confere com as contagens geradas", () => {
  const r = dispatch("forward.revolve", { shape: F1, gauge: { w: 5, h: H6 } }) as Out;
  expect(r.total).toBe(433);
  expect(r.text.split("\n")[0]).toBe("V1: 6 pb no anel mágico (6)");
  const v = dispatch("pattern.verify", { text: r.text }) as { ok: boolean; counts: number[] };
  expect(v.ok).toBe(true);
  expect(v.counts).toEqual(r.counts);
  expect(timelineView().features).toEqual([]); // só consulta
});

test("sem amostra, usa a largura do ponto e a altura da volta das configurações (padrão: igual à largura)", () => {
  expect((dispatch("forward.revolve", { shape: { kind: "sphere", radius: 30 } }) as Out).gauge).toEqual({
    w: 5,
    h: 5,
  });
  dispatch("settings.set", { yarns: { stitchWidthMm: 6, rowHeightMm: 4 } });
  expect((dispatch("forward.revolve", { shape: { kind: "sphere", radius: 30 } }) as Out).gauge).toEqual({
    w: 6,
    h: 4,
  });
  expect(() => dispatch("settings.set", { yarns: { rowHeightMm: 99 } })).toThrow(/altura da volta/);
});

test("modo iniciante liga as contagens amigáveis (caso F6a)", () => {
  const r = dispatch("forward.revolve", { shape: F1, gauge: { w: 5, h: H6 }, beginner: true }) as Out;
  expect(r.counts.slice(0, 4)).toEqual([6, 12, 18, 22]);
  expect(r.issues.map((i) => i.code)).toContain("FRIENDLY_SNAP");
});

test("forma inválida dá erro claro e o texto sai em outro dialeto quando pedido", () => {
  expect(() => dispatch("forward.revolve", { shape: { kind: "cubo" } })).toThrow(/forma desconhecida/);
  const en = dispatch("forward.revolve", { shape: F1, gauge: { w: 5, h: H6 }, dialect: "en-US" }) as Out;
  expect(en.text.split("\n")[0]).toBe("Rnd 1: 6 sc in magic ring (6)");
});
