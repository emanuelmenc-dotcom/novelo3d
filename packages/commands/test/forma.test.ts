// SPDX-License-Identifier: GPL-3.0-or-later
// Receita a partir de forma pelo comando (P5a): forward.revolve gera texto que o leitor de receitas aceita com as mesmas
// contagens, usa a largura e a altura das configurações, liga as contagens amigáveis no modo iniciante e não muda o projeto.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  dispatch,
  flushText,
  replayTimeline,
  resetParts,
  resetSettings,
  timelineView,
} from "../src/index.ts";
import { expectReplayMatchesLive } from "./replay-check.ts";

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

describe("peça por forma (P5b)", () => {
  const body = {
    kind: "stack",
    segments: [
      { radius: 15, height: 15, curve: "round" },
      { radius: 15, height: 20, curve: "line" },
      { radius: 0, height: 15, curve: "round" },
    ],
  };
  type Parts = { parts: { id: string; name: string; text: string }[] };
  const last = () =>
    (dispatch("project.export") as { parts: Parts }).parts.parts.at(-1) as Parts["parts"][number];

  beforeEach(() => resetParts("V1: 6 pb no anel mágico (6)\nV2: 6 aum (12)"));
  afterEach(() => {
    expectReplayMatchesLive();
    resetParts("");
  });

  test("cria uma peça com a receita gerada, numa feature só, com a amostra fixada", () => {
    dispatch("parts.fromShape", { shape: body });
    const p = last();
    expect(p.name).toBe("Peça composta");
    const v = dispatch("pattern.verify", { text: p.text }) as { ok: boolean };
    expect(v.ok).toBe(true);
    flushText();
    const f = timelineView().features;
    expect(f.map((x) => x.method)).toEqual(["parts.fromShape"]);
    expect(f[0]?.params.gauge).toEqual({ w: 5, h: 5 });
    // mudar a configuração depois não muda a peça já criada ao reexecutar
    dispatch("settings.set", { yarns: { stitchWidthMm: 8 } });
    const before = last().text;
    replayTimeline();
    expect(last().text).toBe(before);
  });

  test("editar a forma pela linha do tempo gera a receita de novo", () => {
    dispatch("parts.fromShape", { shape: body, name: "Corpo" });
    const before = last().text;
    const id = timelineView().features[0]?.id as number;
    dispatch("timeline.edit", {
      id,
      params: {
        shape: {
          ...body,
          segments: [
            ...body.segments.slice(0, 1),
            { ...body.segments[1], height: 40 },
            ...body.segments.slice(2),
          ],
        },
      },
    });
    const after = last();
    expect(after.name).toBe("Corpo");
    expect(after.text).not.toBe(before);
    // o cilindro mais alto tem mais voltas (as voltas iguais aparecem juntas, então conta as voltas, não as linhas)
    const rounds = (t: string) =>
      (dispatch("pattern.verify", { text: t }) as { counts: number[] }).counts.length;
    expect(rounds(after.text)).toBe(rounds(before) + 4);
  });

  test("peça achatada e com saliência (P5c): receita válida e a seção vai junto na feature", () => {
    dispatch("parts.fromShape", {
      shape: { kind: "sphere", radius: 25 },
      section: { ratio: 0.6, bumps: [{ angleDeg: 90, widthDeg: 80, amount: 0.4, from: 20, to: 50 }] },
    });
    const p = last();
    expect((dispatch("pattern.verify", { text: p.text }) as { ok: boolean }).ok).toBe(true);
    const round = dispatch("forward.revolve", { shape: { kind: "sphere", radius: 25 } }) as { total: number };
    const flat = dispatch("forward.revolve", {
      shape: { kind: "sphere", radius: 25 },
      section: { ratio: 0.6 },
    }) as { total: number };
    expect(flat.total).toBeLessThan(round.total);
    expect(timelineView().features[0]?.params.section).toMatchObject({ ratio: 0.6 });
    expect(() =>
      dispatch("forward.revolve", { shape: { kind: "sphere", radius: 25 }, section: { ratio: 0 } }),
    ).toThrow(/proporção/);
  });
});
