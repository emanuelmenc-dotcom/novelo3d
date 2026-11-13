// SPDX-License-Identifier: GPL-3.0-or-later
// Comandos do criador de pontos (etapa D, docs/16), chamáveis pela janela e pela ponte MCP (D-21):
// stitchEditor.state | selectBase | apply | undo | reset | setHand. Guardar o ponto no projeto (`save`) é a etapa E.
// Recusa de um comando: lança Error com a mesma convenção dos outros comandos (mensagem em pt-BR), começando pelo código
// da máquina de estados (`no_draw_yet: ...`) para os testes casarem; o estado não muda.
import { stitchDiagramSvg } from "@novelo/charts";
import { stitchBuilder as B } from "@novelo/core";
import {
  commitStitchEditor,
  type Hand,
  resetStitchEditor,
  type StitchEditorState,
  stitchEditorState,
} from "./stitch-editor-store.ts";

type Params = Record<string, unknown>;
type Cmd = (p: Params) => unknown;

const REASON_TEXT: Record<B.Reason, string> = {
  finished: "o ponto já foi terminado: desfaça ou recomece",
  max_loops: `não cabem mais de ${B.MAX_LOOPS} alças na agulha`,
  no_base: "escolha a base de onde puxar a alça",
  bad_base: "a base escolhida não existe",
  base_order: "as bases de um ponto são seguidas e crescentes: use a última base ou a seguinte",
  max_bases: `um ponto usa no máximo ${B.MAX_BASES} bases distintas`,
  bad_k: "puxe por 1 alça ou mais (número inteiro)",
  k_too_big: "não há tantas alças abaixo da última para puxar",
  need_one_loop: "para terminar o ponto deve sobrar exatamente 1 alça: puxe pelas outras antes",
  no_draw_yet: "puxe a alça por pelo menos uma alça antes de terminar o ponto",
  stitch_done: "o ponto está pronto (1 alça depois de puxar): só o fim do ponto é aceito",
};

const fail = (reason: B.Reason): never => {
  throw new Error(`${reason}: ${REASON_TEXT[reason]}`);
};

/** Desenha o estado com o quadro mínimo guardado; se o desenho crescer, o mínimo cresce (e nunca encolhe até o `reset`). */
function render(st: StitchEditorState): {
  svg: string;
  width: number;
  height: number;
  next: StitchEditorState;
} {
  const draw = (s: StitchEditorState): string =>
    stitchDiagramSvg(s.builder, {
      bases: s.bases,
      hand: s.hand,
      ...(s.minWidth ? { minWidth: s.minWidth } : {}),
      ...(s.minHeight ? { minHeight: s.minHeight } : {}),
    });
  const sizeOf = (svg: string): [number, number] => {
    const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    return [Number(m?.[1] ?? 0), Number(m?.[2] ?? 0)];
  };
  let svg = draw(st);
  const [w, h] = sizeOf(svg);
  let next = st;
  if (w > st.minWidth || h > st.minHeight) {
    next = { ...st, minWidth: Math.max(w, st.minWidth), minHeight: Math.max(h, st.minHeight) };
    svg = draw(next);
  }
  const [width, height] = sizeOf(svg);
  return { svg, width, height, next };
}

/** Guarda o quadro mínimo do novo estado (só os comandos que mudam o desenho chamam; ler o estado não altera nada). */
const settle = (st: StitchEditorState): StitchEditorState => render(st).next;

function view(): unknown {
  const st = stitchEditorState();
  const r = render(st);
  const b = st.builder;
  return {
    cmds: b.cmds,
    loops: b.loops.length,
    allowed: B.allowed(b),
    insertBases: B.insertBases(b, st.bases),
    selectedBase: st.selectedBase,
    hand: st.hand,
    bases: st.bases,
    summary: B.summarize(b),
    canUndo: b.cmds.length > 0,
    svg: r.svg,
    width: r.width,
    height: r.height,
  };
}

/** Depois de qualquer mudança, a base escolhida continua sendo uma que o `insert` aceita (senão passa à primeira aceita). */
function withValidBase(st: StitchEditorState): StitchEditorState {
  const ok = B.insertBases(st.builder, st.bases);
  return ok.length === 0 || ok.includes(st.selectedBase) ? st : { ...st, selectedBase: ok[0] as number };
}

function toCmd(p: Params, selectedBase: number): B.Cmd {
  switch (p.kind) {
    case "yo":
      return { kind: "yo" };
    case "insert": {
      const base = p.base === undefined ? selectedBase : Number(p.base);
      const mode = p.mode as B.InsertMode | undefined;
      return { kind: "insert", base, ...(mode ? { mode } : {}) };
    }
    case "draw":
      return { kind: "draw", k: Number(p.k) };
    case "finish":
      return { kind: "finish" };
    default:
      throw new Error("kind deve ser yo, insert, draw ou finish");
  }
}

export const stitchEditorCommands: Record<string, Cmd> = {
  /** Estado do criador: comandos feitos, alças, o que cada botão aceita, bases habilitadas, resumo (tipo, pernas) e o diagrama SVG. */
  "stitchEditor.state": () => view(),

  /** Escolhe a base do próximo `insert`; só aceita uma base que o `insert` aceitaria agora. */
  "stitchEditor.selectBase": (p) => {
    const base = Number(p.base);
    const st = stitchEditorState();
    if (!Number.isInteger(base) || base < 0 || base >= st.bases) return fail("bad_base");
    const ok = B.insertBases(st.builder, st.bases);
    if (!ok.includes(base)) {
      const r = B.apply(st.builder, { kind: "insert", base });
      return fail(r.ok ? "base_order" : r.reason);
    }
    commitStitchEditor({ ...st, selectedBase: base });
    return view();
  },

  /** Um comando da máquina de estados: {kind: "yo"} | {kind: "insert", base?, mode?} | {kind: "draw", k} | {kind: "finish"}. */
  "stitchEditor.apply": (p) => {
    const st = stitchEditorState();
    const r = B.apply(st.builder, toCmd(p, st.selectedBase));
    if (!r.ok) return fail(r.reason);
    commitStitchEditor(settle(withValidBase({ ...st, builder: r.state })));
    return view();
  },

  /** Desfaz o último comando do ponto (o desfazer do projeto não é afetado). */
  "stitchEditor.undo": () => {
    const st = stitchEditorState();
    commitStitchEditor(settle(withValidBase({ ...st, builder: B.undo(st.builder) })));
    return view();
  },

  /** Recomeça o ponto (volta a base escolhida e o quadro ao padrão; a mão escolhida fica). */
  "stitchEditor.reset": () => {
    commitStitchEditor(settle(resetStitchEditor()));
    return view();
  },

  /** Mão que segura a agulha: "right" (ponta à esquerda, base 0 à direita) ou "left" (o espelho). */
  "stitchEditor.setHand": (p) => {
    if (p.hand !== "right" && p.hand !== "left") throw new Error("hand deve ser right ou left");
    commitStitchEditor(settle({ ...stitchEditorState(), hand: p.hand as Hand }));
    return view();
  },
};
