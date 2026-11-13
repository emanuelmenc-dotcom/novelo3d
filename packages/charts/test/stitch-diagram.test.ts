// SPDX-License-Identifier: GPL-3.0-or-later
// Criador de pontos, etapa C (docs/16): diagrama de nós das alças. O oráculo são os eventos da máquina de estados.
// NOVELO_DIAGRAMS=1 grava as imagens em docs/imagens (ponto-<nome>.svg e ponto-pb-passo-N.svg).
import { mkdirSync, writeFileSync } from "node:fs";
import { stitchBuilder as B } from "@novelo/core";
import { describe, expect, test } from "vitest";
import { stitchDiagramSvg } from "../src/index.ts";

const Y: B.Cmd = { kind: "yo" };
const I = (base: number): B.Cmd => ({ kind: "insert", base });
const D = (k: number): B.Cmd => ({ kind: "draw", k });
const F: B.Cmd = { kind: "finish" };
const group = (n: number, ...cmds: B.Cmd[]): B.Cmd[] => Array.from({ length: n }, () => cmds).flat();

// as 9 sequências de docs/16 (as mesmas de packages/core/test/builder.test.ts)
const SEQUENCES: { file: string; name: string; cmds: B.Cmd[] }[] = [
  { file: "corrente", name: "corrente", cmds: [Y, D(1), F] },
  { file: "pbx", name: "ponto baixíssimo (pbx)", cmds: [I(0), D(1), F] },
  { file: "pb", name: "ponto baixo (pb)", cmds: [I(0), Y, D(2), F] },
  { file: "mpa", name: "meio ponto alto (mpa)", cmds: [Y, I(0), Y, D(3), F] },
  { file: "pa", name: "ponto alto (pa)", cmds: [Y, I(0), Y, D(2), Y, D(2), F] },
  { file: "pad", name: "ponto alto duplo (pad)", cmds: [Y, Y, I(0), Y, D(2), Y, D(2), Y, D(2), F] },
  { file: "pb2juntos", name: "2 pb juntos", cmds: [I(0), I(1), Y, D(3), F] },
  { file: "puff", name: "puff (4 mpa na mesma base)", cmds: [...group(4, Y, I(0)), Y, D(9), F] },
  { file: "bobble", name: "bobble (4 pa na mesma base)", cmds: [...group(4, Y, I(0), Y, D(2)), Y, D(5), F] },
];

function states(cmds: B.Cmd[]): B.BuilderState[] {
  const out = [B.start()];
  for (const c of cmds) {
    const r = B.apply(out[out.length - 1] as B.BuilderState, c);
    if (!r.ok) throw new Error(`recusado: ${c.kind} (${r.reason})`);
    out.push(r.state);
  }
  return out;
}

type El = Record<string, string>;

/** Elementos do SVG, em ordem do documento, com seus atributos. */
function elements(svg: string): El[] {
  const out: El[] = [];
  for (const m of svg.matchAll(/<(path|line)\s([^>]*?)\/?>/g)) {
    const attrs: El = { tag: m[1] as string };
    for (const a of (m[2] as string).matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1] as string] = a[2] as string;
    out.push(attrs);
  }
  return out;
}

describe("stitchDiagramSvg: cada prefixo de cada sequência", () => {
  for (const seq of SEQUENCES) {
    test(`${seq.file}: alças na agulha, passagens do fio, pernas e determinismo`, () => {
      states(seq.cmds).forEach((state, step) => {
        const svg = stitchDiagramSvg(state);
        const els = elements(svg);
        const where = `${seq.file} passo ${step}`;
        const at = (pred: (e: El) => boolean): number => els.findIndex(pred);

        // número de alças na agulha = estado
        const onHook = els.filter((e) => e["data-part"] === "back" && e["data-on-hook"] === "1");
        expect(onHook.length, where).toBe(state.loops.length);
        expect(onHook.map((e) => Number(e["data-loop"])).sort((a, b) => a - b)).toEqual(
          state.loops.map((l) => l.id).sort((a, b) => a - b),
        );

        // cada draw: o fio passa por todas as atravessadas, entre as costas e a frente do anel
        const draws = state.events.filter((e) => e.through).map((e) => e.through as number[]);
        for (const through of draws) {
          for (const id of through) {
            const back = at((e) => e["data-loop"] === String(id) && e["data-part"] === "back");
            const front = at((e) => e["data-loop"] === String(id) && e["data-part"] === "front");
            const pass = at((e) => e["data-through"] === String(id));
            expect(back, `${where} anel ${id}`).toBeGreaterThanOrEqual(0);
            expect(pass, `${where} fio em ${id}`).toBeGreaterThan(back);
            expect(front, `${where} frente ${id}`).toBeGreaterThan(pass);
          }
        }
        // as passagens, agrupadas por fio, repetem os `through` dos eventos na mesma ordem
        const byStrand = new Map<string, number[]>();
        for (const e of els) {
          const s = e["data-strand"];
          if (s !== undefined && e["data-through"] !== undefined) {
            byStrand.set(s, [...(byStrand.get(s) ?? []), Number(e["data-through"])]);
          }
        }
        expect([...byStrand.values()], where).toEqual(draws);

        // anéis fechados = alças atravessadas por algum draw
        const gone = new Set(draws.flat());
        expect(els.filter((e) => e["data-part"] === "back" && e["data-on-hook"] === "0").length, where).toBe(
          gone.size,
        );

        // cada base usada tem pernas
        for (const b of B.basesOf(state.cmds)) {
          expect(
            els.some((e) => e["data-leg"] !== undefined && e["data-base"] === String(b)),
            where,
          ).toBe(true);
        }

        // determinismo
        expect(stitchDiagramSvg(state), where).toBe(svg);
      });
    });
  }

  test("a legenda é escapada e as bases extras entram", () => {
    const svg = stitchDiagramSvg(B.start(), { caption: "a <b> & c", bases: 7 });
    expect(svg).toContain("a &lt;b&gt; &amp; c");
    expect(elements(svg).filter((e) => e["data-base-top"] !== undefined).length).toBe(7);
  });
});

const describeCmd = (c: B.Cmd): string =>
  c.kind === "yo"
    ? "laçada"
    : c.kind === "insert"
      ? `inserir na base ${c.base}`
      : c.kind === "draw"
        ? `puxar por ${c.k}`
        : "fim do ponto";

describe.runIf(process.env.NOVELO_DIAGRAMS === "1")("gera as imagens de docs/imagens", () => {
  test("9 pontos prontos e o pb passo a passo", () => {
    mkdirSync("docs/imagens", { recursive: true });
    for (const seq of SEQUENCES) {
      const last = states(seq.cmds).pop() as B.BuilderState;
      writeFileSync(
        `docs/imagens/ponto-${seq.file}.svg`,
        stitchDiagramSvg(last, { caption: `${seq.name}: pronto` }),
      );
    }
    const pb = SEQUENCES.find((s) => s.file === "pb") as (typeof SEQUENCES)[number];
    states(pb.cmds).forEach((state, i) => {
      const label = i === 0 ? "começo" : describeCmd(pb.cmds[i - 1] as B.Cmd);
      writeFileSync(
        `docs/imagens/ponto-pb-passo-${i}.svg`,
        stitchDiagramSvg(state, { caption: `pb, passo ${i}: ${label}` }),
      );
    });
  });
});
