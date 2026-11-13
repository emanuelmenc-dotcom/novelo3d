// SPDX-License-Identifier: GPL-3.0-or-later
// Comandos de edição por ponto (docs/15): pontos, seleção, ferramentas de pintura/tensão e histórico.
// Chamados por index.ts (mapa `commands`), pela interface e pela ponte MCP. Toda seleção é por máscara.
import {
  box,
  brushMask,
  bucketMask,
  byColumn,
  byGroup,
  CODES,
  corridor,
  type Dialect,
  ellipse2d,
  ellipsoid,
  type Filter,
  filterMask,
  gradientBySeq,
  invert,
  type Mask,
  maskCount,
  maskFrom,
  maskIndices,
  neighborhood,
  newMask,
  orderChain,
  pathShortest,
  pathYarn,
  polygon2d,
  rect2d,
  slab,
  smooth,
  sphere,
  stripes,
  type Yarn,
} from "@novelo/core";
import {
  beginGroup,
  clearEdits,
  clearSelection,
  type Engine,
  editSnapshot,
  endGroup,
  engineFor,
  ensurePositions,
  redo,
  redoTick,
  refreshColumns,
  selectedUids,
  selectionMask,
  setDefaultTension,
  setSelection,
  sizeOfTension,
  TENSION_MAX,
  TENSION_MIN,
  undo,
  undoTick,
  writeEach,
  writeProp,
} from "./edit-store.ts";
import { paintSnapshot } from "./paint-store.ts";
import { partsRedoTick, partsUndoTick, redoParts, undoParts } from "./parts-store.ts";

type Params = Record<string, unknown>;
type Cmd = (p: Params) => unknown;

const DIALECTS = ["pt-BR", "en-US", "en-UK", "xva"];
const num = (p: Params, k: string): number => {
  const v = p[k];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`parâmetro '${k}' deve ser número`);
  return v;
};
const obj = (v: unknown, what: string): Params => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`${what} deve ser um objeto`);
  return v as Params;
};

/** Armazém da receita (`text`, `dialect`) com colunas e posições em dia. */
function engine(p: Params, positions = false, commit = false): Engine {
  if (typeof p.text !== "string") throw new Error("parâmetro 'text' deve ser texto");
  const d =
    typeof p.dialect === "string" && DIALECTS.includes(p.dialect) ? (p.dialect as Dialect) : undefined;
  const eng = engineFor(p.text, d, commit);
  // editar sobre receita com erro gravaria uids provisórios que a próxima confirmação poderia dar a outros pontos
  if (commit && !eng.ok) throw new Error("a receita tem erros: corrija-a antes de editar os pontos");
  if (positions) ensurePositions(eng, paintSnapshot().paint);
  else refreshColumns(eng, paintSnapshot().paint);
  return eng;
}

const uidIndex = (eng: Engine, v: unknown, what = "uid"): number => {
  if (typeof v !== "number") throw new Error(`${what} deve ser número`);
  const i = eng.store.indexOf(v);
  if (i < 0) throw new Error(`ponto #${v} não existe nesta receita`);
  return i;
};

const yarnIndex = (v: unknown, yarns: Yarn[] = paintSnapshot().yarns): number => {
  if (typeof v !== "string" || !yarns.some((y) => y.id === v)) {
    throw new Error(`fio '${String(v)}' não existe na paleta (${yarns.map((y) => y.id).join(", ")})`);
  }
  return v.charCodeAt(0) - 65;
};

const vec = (v: unknown, what: string): { x: number; y: number; z: number } => {
  const o = obj(v, what);
  return { x: num(o, "x"), y: num(o, "y"), z: num(o, "z") };
};

function filterOf(eng: Engine, by: Params): Filter {
  const f: Filter = {};
  if (Array.isArray(by.yarns)) f.yarns = by.yarns.map((y) => yarnIndex(y));
  if (Array.isArray(by.tension) && by.tension.length === 2)
    f.tension = [Number(by.tension[0]), Number(by.tension[1])];
  if (Array.isArray(by.codes)) {
    f.codes = by.codes.map((c) => {
      const i = (CODES as readonly string[]).indexOf(String(c));
      if (i < 0) throw new Error(`ponto '${String(c)}' desconhecido (use ${CODES.join(", ")})`);
      return i;
    });
  }
  if (Array.isArray(by.group) && by.group.length === 2) f.group = [Number(by.group[0]), Number(by.group[1])];
  if (Array.isArray(by.seq) && by.seq.length === 2) f.seq = [Number(by.seq[0]), Number(by.seq[1])];
  if (typeof by.counted === "boolean") f.counted = by.counted;
  if (by.within === "selection") f.within = selectionMask(eng);
  return f;
}

/**
 * Máscara descrita por `by` (docs/15): group, uids, filter, column, pathYarn, pathShortest, neighborhood,
 * sphere, ellipsoid, box, corridor, slab, all, selection. Formas 3D usam as posições do layout.
 */
function maskFromSpec(eng: Engine, spec: unknown): Mask {
  const by = obj(spec, "'by'");
  const n = eng.store.n;
  switch (by.kind) {
    case "all":
      return maskFrom(
        n,
        Array.from({ length: n }, (_, i) => i),
      );
    case "selection":
      return selectionMask(eng);
    case "group":
      return byGroup(eng.store, num(by, "from"), by.to === undefined ? num(by, "from") : num(by, "to"));
    case "uids": {
      if (!Array.isArray(by.uids)) throw new Error("'uids' deve ser uma lista");
      return maskFrom(
        n,
        by.uids.map((u) => eng.store.indexOf(Number(u))).filter((i) => i >= 0),
      );
    }
    case "filter":
      return filterMask(eng.store, filterOf(eng, by));
    case "column":
      return byColumn(eng.store, uidIndex(eng, by.uid));
    case "pathYarn":
      return maskFrom(n, pathYarn(eng.store, uidIndex(eng, by.a, "a"), uidIndex(eng, by.b, "b")));
    case "pathShortest": {
      const within = by.within === "selection" ? selectionMask(eng) : undefined;
      return maskFrom(n, pathShortest(eng.store, uidIndex(eng, by.a, "a"), uidIndex(eng, by.b, "b"), within));
    }
    case "neighborhood":
      return neighborhood(eng.store, uidIndex(eng, by.uid), num(by, "hops"));
    case "sphere":
      return sphere(eng.store, vec(by.center, "center"), num(by, "radius"));
    case "ellipsoid":
      return ellipsoid(eng.store, vec(by.center, "center"), vec(by.radii, "radii"));
    case "box":
      return box(eng.store, vec(by.min, "min"), vec(by.max, "max"));
    case "corridor":
      return corridor(eng.store, vec(by.a, "a"), vec(by.b, "b"), num(by, "radius"));
    case "slab":
      return slab(eng.store, vec(by.point, "point"), vec(by.normal, "normal"), num(by, "half"));
    default:
      throw new Error(`seleção '${String(by.kind)}' desconhecida`);
  }
}

/** Alvo de uma ferramenta: a seleção atual (padrão) ou o que `target` descrever. */
function targetOf(eng: Engine, p: Params): Mask {
  return p.target === undefined || p.target === "selection"
    ? selectionMask(eng)
    : maskFromSpec(eng, p.target);
}

const OPS = ["replace", "add", "remove", "intersect"] as const;
const opOf = (p: Params): (typeof OPS)[number] => {
  const v = p.op ?? "replace";
  if (!(OPS as readonly unknown[]).includes(v))
    throw new Error(`operação '${String(v)}' inválida (${OPS.join(", ")})`);
  return v as (typeof OPS)[number];
};

const propOf = (p: Params): "yarn" | "tension" => {
  if (p.prop !== "yarn" && p.prop !== "tension") throw new Error("'prop' deve ser 'yarn' ou 'tension'");
  return p.prop;
};

/** Valor a gravar: letra do fio, número da tensão, ou null (apagar). */
function valueFor(prop: "yarn" | "tension", v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (prop === "yarn") return yarnIndex(v);
  if (typeof v !== "number" || !(v >= TENSION_MIN && v <= TENSION_MAX)) {
    throw new Error(`tensão deve estar entre ${TENSION_MIN} e ${TENSION_MAX}`);
  }
  return v;
}

function pointInfo(eng: Engine, i: number) {
  const s = eng.store;
  const nb: number[] = [];
  s.forNeighbors(i, (j) => nb.push(s.uid[j] as number));
  const yarn = s.col("yarn")[i] as number;
  const tension = s.col("tension")[i] as number;
  return {
    uid: s.uid[i] as number,
    seq: s.seq[i] as number,
    code: CODES[s.code[i] as number],
    counted: s.counted[i] === 1,
    group: s.group[i] as number,
    index: s.gIndex[i] as number,
    yarn: String.fromCharCode(65 + yarn),
    tension,
    size: sizeOfTension(tension),
    neighbors: nb,
  };
}

function selectionReport(eng: Engine, all = false) {
  const uids = selectedUids();
  const m = selectionMask(eng);
  const groups = new Map<number, number>();
  for (const i of maskIndices(m))
    groups.set(eng.store.group[i] as number, (groups.get(eng.store.group[i] as number) ?? 0) + 1);
  return {
    count: maskCount(m),
    uids: !all && uids.length > 2000 ? uids.slice(0, 2000) : uids,
    truncated: !all && uids.length > 2000,
    byGroup: [...groups].sort((a, b) => a[0] - b[0]).map(([group, count]) => ({ group, count })),
    edit: editSnapshot(),
  };
}

export const editCommands: Record<string, Cmd> = {
  /** Resumo do armazém de pontos da receita: pontos, voltas, uids, edições. */
  "points.info": (p) => {
    const eng = engine(p);
    const s = eng.store;
    return {
      points: s.n,
      groups: s.gFirst.length - 1,
      firstUid: s.uid[0] ?? null,
      lastUid: s.uid[s.n - 1] ?? null,
      nextUid: eng.uid.next,
      edit: editSnapshot(),
    };
  },
  /** Dados de um ponto pelo uid: ordem, volta, fio, tensão, tamanho e vizinhos. */
  "points.get": (p) => {
    const eng = engine(p);
    return pointInfo(eng, uidIndex(eng, p.uid));
  },
  /** Define o fio ou a tensão de um alvo (padrão: a seleção). `value` null apaga a edição do ponto. */
  "points.set": (p) => {
    const eng = engine(p, false, true);
    const prop = propOf(p);
    const mask = targetOf(eng, p);
    if (maskCount(mask) === 0) throw new Error("nenhum ponto no alvo (selecione pontos antes)");
    return { changed: maskCount(mask), edit: writeProp(eng, prop, mask, valueFor(prop, p.value)) };
  },

  // --- seleção
  /** Seleção atual; sem `all`, no máximo 2000 uids na lista (a contagem é sempre completa). */
  "selection.get": (p) => selectionReport(engine(p), p.all === true),
  /** Seleciona por `by` (ver maskFromSpec) combinando com a atual por `op`: replace, add, remove, intersect. */
  "selection.select": (p) => {
    const eng = engine(p, true, true);
    setSelection(eng, maskFromSpec(eng, p.by), opOf(p));
    return selectionReport(eng);
  },
  "selection.clear": () => ({ edit: clearSelection() }),
  "selection.invert": (p) => {
    const eng = engine(p, false, true);
    setSelection(eng, invert(selectionMask(eng)), "replace");
    return selectionReport(eng);
  },
  /**
   * Seleção por forma na tela: `xy` = [x0,y0,x1,y1,...] da projeção de cada ponto (ordem de trabalho),
   * `shape` = rect {x0,y0,x1,y1} | ellipse {cx,cy,rx,ry} | lasso {points:[[x,y],...]}; `visible` opcional (uids).
   */
  "selection.screen": (p) => {
    const eng = engine(p, false, true);
    const n = eng.store.n;
    if (!Array.isArray(p.xy) || p.xy.length !== n * 2) throw new Error(`'xy' deve ter ${n * 2} números`);
    const xy = p.xy as number[];
    const sh = obj(p.shape, "'shape'");
    const vis = Array.isArray(p.visible)
      ? maskFrom(
          n,
          (p.visible as number[]).map((u) => eng.store.indexOf(u)),
        )
      : undefined;
    let m: Mask;
    if (sh.kind === "rect")
      m = rect2d(xy, n, num(sh, "x0"), num(sh, "y0"), num(sh, "x1"), num(sh, "y1"), vis);
    else if (sh.kind === "ellipse")
      m = ellipse2d(xy, n, num(sh, "cx"), num(sh, "cy"), num(sh, "rx"), num(sh, "ry"), vis);
    else if (sh.kind === "lasso" && Array.isArray(sh.points))
      m = polygon2d(xy, n, sh.points as [number, number][], vis);
    else throw new Error("forma deve ser rect, ellipse ou lasso");
    setSelection(eng, m, opOf(p));
    return selectionReport(eng);
  },
  /** Verifica se a seleção é uma cadeia linear (borda ou caminho), para costuras: ordem em uids e se fecha. */
  "selection.chain": (p) => {
    const eng = engine(p);
    const c = orderChain(eng.store, selectionMask(eng));
    if (!c) return { linear: false, reason: "a seleção não é uma linha contínua sem ramificação" };
    return {
      linear: true,
      closed: c.closed,
      count: c.order.length,
      uids: c.order.map((i) => eng.store.uid[i] as number),
    };
  },

  // --- ferramentas de pintura e tensão
  /** Pincel: pontos até `hops` saltos do ponto `uid` recebem `value` em `prop`. `onlySelection` limita ao selecionado. */
  "tool.brush": (p) => {
    const eng = engine(p, false, true);
    const prop = propOf(p);
    const mask = brushMask(
      eng.store,
      uidIndex(eng, p.uid),
      num(p, "hops"),
      p.onlySelection === true ? selectionMask(eng) : undefined,
    );
    return { changed: maskCount(mask), edit: writeProp(eng, prop, mask, valueFor(prop, p.value)) };
  },
  /** Balde: região contígua do ponto `uid` com o mesmo valor de `prop`. */
  "tool.bucket": (p) => {
    const eng = engine(p, false, true);
    const prop = propOf(p);
    const mask = bucketMask(
      eng.store,
      uidIndex(eng, p.uid),
      prop,
      p.onlySelection === true ? selectionMask(eng) : undefined,
    );
    return { changed: maskCount(mask), edit: writeProp(eng, prop, mask, valueFor(prop, p.value)) };
  },
  /** Listras repetidas por volta sobre o alvo: pattern = [["A",2],["B",1]] (2 voltas A, 1 volta B, repete). */
  "tool.stripes": (p) => {
    const eng = engine(p, false, true);
    const target = targetOf(eng, p);
    if (maskCount(target) === 0) throw new Error("nenhum ponto no alvo (selecione pontos antes)");
    if (!Array.isArray(p.pattern) || p.pattern.length === 0)
      throw new Error("'pattern' deve ser [[fio, voltas], ...]");
    const pat = (p.pattern as unknown[]).map((e): [number, number] => {
      if (!Array.isArray(e)) throw new Error("cada item de 'pattern' deve ser [fio, voltas]");
      return [yarnIndex(e[0]), Math.max(1, Math.floor(Number(e[1])))];
    });
    return {
      changed: maskCount(target),
      edit: writeEach(eng, "yarn", stripes(eng.store, pat, target), target),
    };
  },
  /** Gradiente de tensão ao longo do trabalho sobre o alvo, de `from` a `to`. */
  "tool.gradient": (p) => {
    const eng = engine(p, false, true);
    const target = targetOf(eng, p);
    if (maskCount(target) === 0) throw new Error("nenhum ponto no alvo (selecione pontos antes)");
    const v = gradientBySeq(eng.store, target, num(p, "from"), num(p, "to"));
    return { changed: maskCount(target), edit: writeEach(eng, "tension", v, target) };
  },
  /** Suaviza a tensão do alvo com a dos vizinhos (`passes` vezes, padrão 1). */
  "tool.smooth": (p) => {
    const eng = engine(p, false, true);
    const target = targetOf(eng, p);
    if (maskCount(target) === 0) throw new Error("nenhum ponto no alvo (selecione pontos antes)");
    const passes = typeof p.passes === "number" ? Math.max(1, Math.min(50, Math.floor(p.passes))) : 1;
    return {
      changed: maskCount(target),
      edit: writeEach(eng, "tension", smooth(eng.store, "tension", target, passes), target),
    };
  },
  /** Conta-gotas: valor de `prop` no ponto `uid` (fio: letra; tensão: número). */
  "tool.eyedropper": (p) => {
    const eng = engine(p);
    const prop = propOf(p);
    const i = uidIndex(eng, p.uid);
    const v = eng.store.col(prop)[i] as number;
    return { uid: p.uid, prop, value: prop === "yarn" ? String.fromCharCode(65 + v) : v };
  },

  // --- tensão padrão e histórico
  "edit.get": () => editSnapshot(),
  /** Tensão padrão do projeto (-1 frouxo ... +1 firme) para os pontos sem edição própria. */
  "edit.setDefaultTension": (p) => ({ edit: setDefaultTension(num(p, "value")) }),
  /** Apaga todas as edições de fio e tensão por ponto (a pintura por regras continua). */
  "edit.clear": () => ({ edit: clearEdits() }),
  /** Começa um traço: as edições até history.end viram um único passo de desfazer (pincel arrastado). */
  "history.begin": () => {
    beginGroup();
    return { ok: true };
  },
  "history.end": () => {
    endGroup();
    return { ok: true };
  },
  /** Se há o que desfazer/refazer (edições por ponto, peças e costuras, na ordem em que aconteceram). */
  "history.get": () => ({
    canUndo: undoTick() > 0 || partsUndoTick() > 0,
    canRedo: redoTick() > 0 || partsRedoTick() > 0,
  }),
  /** Desfaz a ação mais recente, seja de pontos (fio, tensão) ou de peças e costuras. */
  "history.undo": () => {
    const e = undoTick();
    const q = partsUndoTick();
    if (e === 0 && q === 0) throw new Error("nada para desfazer");
    if (e >= q) undo();
    else undoParts();
    return { edit: editSnapshot() };
  },
  "history.redo": () => {
    const e = redoTick();
    const q = partsRedoTick();
    if (e === 0 && q === 0) throw new Error("nada para refazer");
    if (e >= q) redo();
    else redoParts();
    return { edit: editSnapshot() };
  },
};

export { newMask, TENSION_MAX, TENSION_MIN };
