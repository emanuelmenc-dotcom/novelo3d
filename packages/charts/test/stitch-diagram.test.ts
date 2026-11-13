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
type Hand = "right" | "left";

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

const HOLE_RX = 15;
interface Hole {
  cx: number;
  cy: number;
}

/** Furos dos anéis fechados: o centro sai do arco das costas ("M x y A ..."), a meia largura é HOLE_RX. */
function holesOf(els: El[]): Map<number, Hole> {
  const out = new Map<number, Hole>();
  for (const e of els) {
    if (e["data-part"] !== "back" || e["data-on-hook"] !== "0") continue;
    const m = /^M ([\d.-]+) ([\d.-]+)/.exec(e.d ?? "");
    if (m) out.set(Number(e["data-loop"]), { cx: Number(m[1]) + HOLE_RX, cy: Number(m[2]) });
  }
  return out;
}

/** O segmento atravessa o furo: passa pela altura do centro com x dentro da meia largura. */
function crosses(e: El, h: Hole): boolean {
  const [x1, y1, x2, y2] = [Number(e.x1), Number(e.y1), Number(e.x2), Number(e.y2)] as [
    number,
    number,
    number,
    number,
  ];
  if (h.cy < Math.min(y1, y2) - 0.05 || h.cy > Math.max(y1, y2) + 0.05) return false;
  if (Math.abs(y2 - y1) < 0.05) return Math.min(x1, x2) < h.cx + HOLE_RX && Math.max(x1, x2) > h.cx - HOLE_RX;
  const t = Math.min(1, Math.max(0, (h.cy - y1) / (y2 - y1)));
  return Math.abs(x1 + (x2 - x1) * t - h.cx) < HOLE_RX;
}

/** Todas as invariantes do diagrama de um estado (alças, ligações do fio, pernas, determinismo). */
function checkDiagram(state: B.BuilderState, where: string, hand: Hand = "right"): void {
  const svg = stitchDiagramSvg(state, { hand });
  const els = elements(svg);
  const at = (pred: (e: El) => boolean): number => els.findIndex(pred);

  // número de alças na agulha = estado
  const onHook = els.filter((e) => e["data-part"] === "back" && e["data-on-hook"] === "1");
  expect(onHook.length, where).toBe(state.loops.length);
  expect(onHook.map((e) => Number(e["data-loop"])).sort((a, b) => a - b)).toEqual(
    state.loops.map((l) => l.id).sort((a, b) => a - b),
  );

  const draws = state.events.filter((e) => e.through).map((e) => e.through as number[]);
  const holes = holesOf(els);
  draws.forEach((through, j) => {
    const mine = els.filter((e) => e["data-draw"] === String(j + 1));
    // as passagens do draw, na ordem do documento, são o `through` do evento
    expect(
      mine.filter((e) => e["data-through"] !== undefined).map((e) => Number(e["data-through"])),
      `${where} draw ${j + 1}`,
    ).toEqual(through);
    // o fio do draw atravessa os furos de exatamente as alças atravessadas, e de mais nenhuma
    const hit = new Set<number>();
    for (const seg of mine) for (const [id, h] of holes) if (crosses(seg, h)) hit.add(id);
    expect(
      [...hit].sort((a, b) => a - b),
      `${where} furos do draw ${j + 1}`,
    ).toEqual([...through].sort((a, b) => a - b));
    // camadas: costas do anel, depois o fio, depois a frente
    for (const id of through) {
      const back = at((e) => e["data-loop"] === String(id) && e["data-part"] === "back");
      const front = at((e) => e["data-loop"] === String(id) && e["data-part"] === "front");
      const pass = at((e) => e["data-through"] === String(id));
      expect(pass, `${where} fio em ${id}`).toBeGreaterThan(back);
      expect(front, `${where} frente ${id}`).toBeGreaterThan(pass);
    }
  });
  // anéis fechados = alças atravessadas por algum draw
  expect(holes.size, where).toBe(new Set(draws.flat()).size);

  // pernas: cada base usada tem pernas e nenhuma perna atravessa o furo de um anel
  for (const b of B.basesOf(state.cmds)) {
    expect(
      els.some((e) => e["data-leg"] !== undefined && e["data-base"] === String(b)),
      where,
    ).toBe(true);
  }
  for (const leg of els.filter((e) => e["data-leg"] !== undefined)) {
    for (const [id, h] of holes)
      expect(crosses(leg, h), `${where} perna de ${leg["data-leg"]} no anel ${id}`).toBe(false);
  }

  // folga: nenhum anel fechado fica sobre um V (só as pernas ligam o anel à base)
  const vCenters = new Map<number, number>();
  for (const e of els) {
    const m = /^M ([\d.-]+) /.exec(e.d ?? "");
    if (e["data-base-top"] !== undefined && m) vCenters.set(Number(e["data-base-top"]), Number(m[1]) + 14);
  }
  for (const [id, h] of holes) {
    for (const [b, x] of vCenters) {
      expect(Math.abs(h.cx - x), `${where} anel ${id} sobre a base ${b}`).toBeGreaterThanOrEqual(20);
    }
  }

  // determinismo
  expect(stitchDiagramSvg(state, { hand }), where).toBe(svg);
}

/** Caminhada aleatória (semente fixa) pelos comandos que `allowed` aceita; devolve todos os estados do caminho. */
function walk(seed: number): B.BuilderState[] {
  let a = seed >>> 0;
  const rnd = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [B.start()];
  const len = 1 + Math.floor(rnd() * 20);
  for (let i = 0; i < len; i++) {
    const s = out[out.length - 1] as B.BuilderState;
    const al = B.allowed(s);
    const options: B.Cmd[] = [];
    if (al.yo) options.push(Y);
    if (al.insert) {
      const bases = B.basesOf(s.cmds);
      const last = bases[bases.length - 1];
      options.push(I(last ?? 0));
      if (last !== undefined && bases.length < B.MAX_BASES) options.push(I(last + 1));
    }
    for (let k = 1; k <= al.drawMax; k++) options.push(D(k));
    if (al.finish) options.push(F);
    const pick = options[Math.floor(rnd() * options.length)];
    if (!pick) break;
    const r = B.apply(s, pick);
    if (r.ok) out.push(r.state);
  }
  return out;
}

describe("stitchDiagramSvg: cada prefixo de cada sequência", () => {
  for (const seq of SEQUENCES) {
    test(`${seq.file}: alças, ligações do fio, pernas e determinismo`, () => {
      states(seq.cmds).forEach((state, step) => {
        checkDiagram(state, `${seq.file} passo ${step}`);
        checkDiagram(state, `${seq.file} passo ${step} (canhoto)`, "left");
      });
    });
  }

  test("sequências aleatórias com semente (300 caminhadas, mão direita; 60 na esquerda): as mesmas invariantes", () => {
    for (let seed = 1; seed <= 300; seed++) {
      walk(seed).forEach((state, step) => {
        checkDiagram(state, `semente ${seed} passo ${step}`);
        if (seed <= 60) checkDiagram(state, `semente ${seed} passo ${step} (canhoto)`, "left");
      });
    }
  });

  test("um laço que é o de cima de dois draws seguidos (yo, yo, draw 1, draw 1) passa pelos dois furos", () => {
    const s = states([Y, Y, D(1), D(1)]).pop() as B.BuilderState;
    checkDiagram(s, "yo yo d1 d1");
  });

  test("a legenda é escapada e as bases extras entram", () => {
    const svg = stitchDiagramSvg(B.start(), { caption: "a <b> & c", bases: 7 });
    expect(svg).toContain("a &lt;b&gt; &amp; c");
    expect(elements(svg).filter((e) => e["data-base-top"] !== undefined).length).toBe(7);
  });
});

/** Centros (x) dos V das bases, dos anéis na agulha e dos anéis fechados, mais a largura do desenho. */
function geometry(svg: string): {
  width: number;
  v: Map<number, number>;
  hook: Map<number, number>;
  closed: Map<number, number>;
} {
  const els = elements(svg);
  const v = new Map<number, number>();
  const hook = new Map<number, number>();
  const closed = new Map<number, number>();
  for (const e of els) {
    const m = /^M ([\d.-]+) /.exec(e.d ?? "");
    if (!m) continue;
    if (e["data-base-top"] !== undefined) v.set(Number(e["data-base-top"]), Number(m[1]) + 14);
    else if (e["data-part"] === "back" && e["data-on-hook"] === "1")
      hook.set(Number(e["data-loop"]), Number(m[1]));
    else if (e["data-part"] === "back") closed.set(Number(e["data-loop"]), Number(m[1]) + HOLE_RX);
  }
  return { width: Number(/viewBox="0 0 ([\d.]+) /.exec(svg)?.[1]), v, hook, closed };
}

const SLOT = 60;

describe("mão direita e mão esquerda", () => {
  test("mão direita: a base 0 fica na direita e as outras crescem para a esquerda (4 3 2 1 0)", () => {
    for (const seq of SEQUENCES) {
      for (const state of states(seq.cmds)) {
        const xs = [...geometry(stitchDiagramSvg(state)).v.entries()]
          .sort((a, b) => a[0] - b[0])
          .map((e) => e[1]);
        for (let i = 1; i < xs.length; i++)
          expect(xs[i] as number, seq.file).toBeLessThan(xs[i - 1] as number);
      }
    }
    const left = [...geometry(stitchDiagramSvg(B.start(), { hand: "left" })).v.entries()].sort(
      (a, b) => a[0] - b[0],
    );
    for (let i = 1; i < left.length; i++)
      expect((left[i] as [number, number])[1]).toBeGreaterThan((left[i - 1] as [number, number])[1]);
  });

  test("a agulha tem a ponta à esquerda e o cabo à direita (mão direita); na esquerda, o contrário", () => {
    const els = elements(stitchDiagramSvg(B.start()));
    const handle = els.find((e) => e["data-hook-handle"] !== undefined) as El;
    const tip = els.find((e) => e["data-hook-tip"] !== undefined) as El;
    const tipX = Number(/^M ([\d.-]+) /.exec(tip.d as string)?.[1]);
    expect(tipX).toBeLessThan(Math.min(Number(handle.x1), Number(handle.x2)));
    const l = elements(stitchDiagramSvg(B.start(), { hand: "left" }));
    const handleL = l.find((e) => e["data-hook-handle"] !== undefined) as El;
    const tipL = Number(
      /^M ([\d.-]+) /.exec((l.find((e) => e["data-hook-tip"] !== undefined) as El).d as string)?.[1],
    );
    expect(tipL).toBeGreaterThan(Math.max(Number(handleL.x1), Number(handleL.x2)));
  });

  test("alças ancoradas na ponta: a mais nova na ponta, cada mais antiga 60 px para o cabo; yo e insert empurram, draw devolve", () => {
    for (const seq of SEQUENCES) {
      const all = states(seq.cmds);
      const pos = (state: B.BuilderState): Map<number, number> => geometry(stitchDiagramSvg(state)).hook;
      for (const state of all) {
        const p = pos(state);
        const n = state.loops.length;
        for (const [i, l] of state.loops.entries()) {
          expect(p.get(l.id), `${seq.file}: alça ${l.id}`).toBe(30 + (n - 1 - i) * SLOT);
        }
      }
      for (let i = 1; i < all.length; i++) {
        const [prev, next, cmd] = [
          all[i - 1] as B.BuilderState,
          all[i] as B.BuilderState,
          seq.cmds[i - 1] as B.Cmd,
        ];
        const [a, b] = [pos(prev), pos(next)];
        if (cmd.kind === "yo" || cmd.kind === "insert") {
          for (const l of prev.loops)
            expect(b.get(l.id), `${seq.file} passo ${i}`).toBe((a.get(l.id) as number) + SLOT);
        } else if (cmd.kind === "draw") {
          const top = prev.loops[prev.loops.length - 1] as B.Loop;
          expect(b.get(top.id), `${seq.file} passo ${i}`).toBe(30);
          for (const l of next.loops.slice(0, -1))
            expect(b.get(l.id), `${seq.file} passo ${i}`).toBe((a.get(l.id) as number) - SLOT * cmd.k);
        }
      }
    }
  });

  test("a mão esquerda é o espelho exato da direita: mesma largura, x = largura - x, mesmos textos", () => {
    for (const seq of SEQUENCES) {
      for (const state of states(seq.cmds)) {
        const [r, l] = [stitchDiagramSvg(state), stitchDiagramSvg(state, { hand: "left" })];
        const [gr, gl] = [geometry(r), geometry(l)];
        expect(gl.width, seq.file).toBe(gr.width);
        for (const [key, ml, mr] of [
          ["V", gl.v, gr.v],
          ["agulha", gl.hook, gr.hook],
          ["fechados", gl.closed, gr.closed],
        ] as const) {
          expect([...ml.keys()], `${seq.file} ${key}`).toEqual([...mr.keys()]);
          for (const [id, x] of mr)
            expect(ml.get(id), `${seq.file} ${key} ${id}`).toBeCloseTo(gr.width - x, 1);
        }
        const [er, el] = [
          elements(r).filter((e) => e.tag === "line"),
          elements(l).filter((e) => e.tag === "line"),
        ];
        expect(el.length).toBe(er.length);
        er.forEach((e, i) => {
          const o = el[i] as El;
          expect(Number(o.x1), seq.file).toBeCloseTo(gr.width - Number(e.x1), 1);
          expect(Number(o.x2), seq.file).toBeCloseTo(gr.width - Number(e.x2), 1);
          expect([o.y1, o.y2]).toEqual([e.y1, e.y2]);
        });
        const texts = (svg: string): string[] =>
          [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1] as string);
        expect(texts(l)).toEqual(texts(r));
      }
    }
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
      writeFileSync(
        `docs/imagens/ponto-${seq.file}-canhoto.svg`,
        stitchDiagramSvg(last, { caption: `${seq.name}: pronto (canhoto)`, hand: "left" }),
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
