// SPDX-License-Identifier: GPL-3.0-or-later
// Comandos de peças e montagem (P3.5): peças (original, instância, espelhada, cópia), costuras entre linhas contínuas
// de pontos e a vista de montagem com todas as peças. Chamados por index.ts, pela interface e pela ponte MCP (D-21).
import { type Dialect, maskFrom, orderChain } from "@novelo/core";
import { commitText, engineFor, notifyEdit, selectionMask } from "./edit-store.ts";
import {
  addAssembly,
  addInstance,
  addPart,
  addSeam,
  asmById,
  assemblyChain,
  assemblyContents,
  clearDraft,
  copyPart,
  detachPart,
  type Part,
  partById,
  partsSnapshot,
  patchAssembly,
  patchPart,
  patchSeam,
  removeAssembly,
  removePart,
  removeSeam,
  rootOf,
  SEAM_TYPE_NAMES,
  SEAM_TYPES,
  type Seam,
  type SeamSide,
  type SeamType,
  setActive,
  setAssemblyHidden,
  setDraft,
  setPartsHidden,
  setPartText,
  transact,
  withPart,
} from "./parts-store.ts";
import { getSettings } from "./settings.ts";
import { setTreeSelected, treeSelected } from "./tree-store.ts";

type Params = Record<string, unknown>;
type Cmd = (p: Params) => unknown;

const DIALECTS = ["pt-BR", "en-US", "en-UK", "xva"];
const dialectOf = (v: unknown): Dialect | undefined =>
  typeof v === "string" && DIALECTS.includes(v) ? (v as Dialect) : undefined;

const view = () => {
  const s = partsSnapshot();
  return {
    active: s.active,
    activeRoot: rootOf(s.active).id,
    parts: s.parts.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      source: p.source ?? null,
      mirror: p.mirror ?? null,
      pos: p.pos,
      rot: p.rot,
      yarnMap: p.yarnMap ?? null,
      hidden: p.hidden ?? false,
      assembly: p.assembly ?? null,
    })),
    assemblies: s.assemblies.length,
    seams: s.seams.length,
    draft: {
      a: s.draft.a ? { part: s.draft.a.part, count: s.draft.a.uids.length } : null,
      b: s.draft.b ? { part: s.draft.b.part, count: s.draft.b.uids.length } : null,
    },
  };
};

type TreeNode = Record<string, unknown>;
/** Filhos de uma montagem (ou da raiz): montagens de dentro, com os filhos delas, e peças. */
function asmChildren(s: ReturnType<typeof partsSnapshot>, parent: string | undefined): TreeNode[] {
  return [
    ...s.assemblies
      .filter((a) => a.parent === parent)
      .map((a) => ({
        id: a.id,
        kind: "assembly",
        name: a.name,
        active: false,
        visible: !a.hidden,
        pos: a.pos,
        rot: a.rot,
        children: asmChildren(s, a.id),
      })),
    ...s.parts
      .filter((q) => q.assembly === parent)
      .map((q) => ({
        id: q.id,
        kind: q.kind === "own" ? "part" : q.kind,
        name: q.name,
        active: q.id === s.active,
        visible: !q.hidden,
        source: q.source ?? null,
      })),
  ];
}

const treeView = () => {
  const s = partsSnapshot();
  // seleção da árvore: a raiz ou uma costura que ainda existe; senão acompanha a peça ativa (clicar numa peça no 3D a ativa)
  const saved = treeSelected();
  const selected =
    saved === "root" ||
    (saved !== null && (s.seams.some((m) => m.id === saved) || s.assemblies.some((m) => m.id === saved)))
      ? saved
      : s.active;
  return {
    selected,
    active: s.active,
    root: {
      id: "root",
      kind: "assembly",
      name: "Projeto",
      children: [
        ...asmChildren(s, undefined),
        ...s.seams.map((m) => ({
          id: m.id,
          kind: "seam",
          name: m.name,
          active: false,
          visible: true,
          parts: [m.a.part, m.b.part],
          ok: checkSeam(m.a, m.b, m.reverse, m.ratio).ok,
        })),
      ],
    },
  };
};

// ------------------------------------------------------------------ costuras: validação

interface SideInfo {
  count: number;
  closed: boolean;
  /** uids em ordem ao longo da linha. */
  order: number[];
}

function sideInfo(side: SeamSide, label: string, errors: string[]): SideInfo | null {
  const part = partById(side.part);
  return withPart(part.id, (root) => {
    const eng = engineFor(root.text, root.dialect);
    const idx = side.uids.map((u) => eng.store.indexOf(u));
    if (side.uids.length === 0 || idx.some((i) => i < 0)) {
      errors.push(
        `${label}: há pontos que não existem mais em '${part.name}' (a receita mudou); refaça a seleção`,
      );
      return null;
    }
    const chain = orderChain(eng.store, maskFrom(eng.store.n, idx));
    if (!chain) {
      errors.push(`${label}: os pontos de '${part.name}' não formam uma linha contínua sem ramificação`);
      return null;
    }
    return {
      count: chain.order.length,
      closed: chain.closed,
      order: chain.order.map((i) => eng.store.uid[i] as number),
    };
  });
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export interface SeamCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  a: { count: number; closed: boolean } | null;
  b: { count: number; closed: boolean } | null;
  /** Pares de pontos (uid de A, uid de B) a costurar, em ordem. */
  pairs: [number, number][];
  /** Proporção sugerida quando a atual não fecha. */
  suggestedRatio: [number, number] | null;
}

export function checkSeam(a: SeamSide, b: SeamSide, reverse: boolean, ratio: [number, number]): SeamCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ia = sideInfo(a, "Lado A", errors);
  const ib = sideInfo(b, "Lado B", errors);
  const out: SeamCheck = {
    ok: false,
    errors,
    warnings,
    a: ia && { count: ia.count, closed: ia.closed },
    b: ib && { count: ib.count, closed: ib.closed },
    pairs: [],
    suggestedRatio: null,
  };
  if (!ia || !ib) return out;
  if (a.part === b.part || rootOf(a.part).id === rootOf(b.part).id) {
    const shared = ia.order.filter((u) => ib.order.includes(u));
    if (a.part === b.part && shared.length > 0) {
      errors.push("os dois lados compartilham pontos; escolha linhas diferentes");
    }
  }
  const [n, m] = ratio;
  const g = gcd(ia.count, ib.count);
  const sug: [number, number] = [ia.count / g, ib.count / g];
  out.suggestedRatio = sug[0] <= 8 && sug[1] <= 8 ? sug : null;
  if (ia.count % n !== 0 || ib.count % m !== 0 || ia.count / n !== ib.count / m) {
    errors.push(
      `a contagem não fecha com ${n}:${m}: A tem ${ia.count} pontos e B tem ${ib.count}${
        out.suggestedRatio ? `; use ${out.suggestedRatio[0]}:${out.suggestedRatio[1]}` : ""
      }`,
    );
  }
  if (ia.closed !== ib.closed) {
    warnings.push("um lado é uma volta fechada e o outro é aberto: confira se o início e o fim se encontram");
  }
  if (errors.length > 0) return out;
  const orderB = reverse ? [...ib.order].reverse() : ib.order;
  const groups = ia.count / n;
  const per = Math.max(n, m);
  for (let k = 0; k < groups; k++) {
    for (let i = 0; i < per; i++) {
      out.pairs.push([
        ia.order[k * n + Math.floor((i * n) / per)] as number,
        orderB[k * m + Math.floor((i * m) / per)] as number,
      ]);
    }
  }
  out.ok = true;
  return out;
}

const sideOf = (v: unknown, what: string): SeamSide => {
  const o = v as { part?: unknown; uids?: unknown } | null;
  if (!o || typeof o.part !== "string" || !Array.isArray(o.uids))
    throw new Error(`${what} deve ser {part, uids:[...]}`);
  partById(o.part);
  return { part: o.part, uids: o.uids.map(Number) };
};

const ratioOf = (v: unknown): [number, number] => {
  if (v === undefined) return [1, 1];
  if (!Array.isArray(v) || v.length !== 2 || v.some((x) => !Number.isInteger(x) || x < 1 || x > 8)) {
    throw new Error("ratio deve ser [a, b] com inteiros de 1 a 8 (pontos de A para pontos de B)");
  }
  return [v[0] as number, v[1] as number];
};

const typeOf = (v: unknown): SeamType => {
  if (v === undefined) return getSettings().yarns.seam.type;
  if (!(SEAM_TYPES as readonly unknown[]).includes(v))
    throw new Error(`tipo de costura deve ser ${SEAM_TYPES.join(", ")}`);
  return v as SeamType;
};

// ------------------------------------------------------------------ transformação das peças na montagem

const rad = (d: number) => (d * Math.PI) / 180;
type Placed = { rot: [number, number, number]; pos: [number, number, number]; mirror?: string };
export function transformFn(part: Placed): (x: number, y: number, z: number) => [number, number, number] {
  const [ax, ay, az] = part.rot.map(rad) as [number, number, number];
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  const mx = part.mirror === "x" ? -1 : 1;
  const my = part.mirror === "y" ? -1 : 1;
  const mz = part.mirror === "z" ? -1 : 1;
  return (x0, y0, z0) => {
    const x = x0 * mx;
    const y = y0 * my;
    const z = z0 * mz;
    // R = Rz * Ry * Rx
    const y1 = y * cx - z * sx;
    const z1 = y * sx + z * cx;
    const x2 = x * cy + z1 * sy;
    const z2 = -x * sy + z1 * cy;
    const x3 = x2 * cz - y1 * sz;
    const y3 = x2 * sz + y1 * cz;
    return [x3 + part.pos[0], y3 + part.pos[1], z2 + part.pos[2]];
  };
}

/** O inverso de `transformFn`: do espaço de fora de volta ao espaço da peça (ou montagem). */
export function invTransformFn(part: Placed): (x: number, y: number, z: number) => [number, number, number] {
  const [ax, ay, az] = part.rot.map(rad) as [number, number, number];
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  const mx = part.mirror === "x" ? -1 : 1;
  const my = part.mirror === "y" ? -1 : 1;
  const mz = part.mirror === "z" ? -1 : 1;
  return (x0, y0, z0) => {
    const x3 = x0 - part.pos[0];
    const y3 = y0 - part.pos[1];
    const z2 = z0 - part.pos[2];
    // desfaz Rz, depois Ry, depois Rx (a ordem contrária de transformFn)
    const x2 = x3 * cz + y3 * sz;
    const y1 = -x3 * sz + y3 * cz;
    const x = x2 * cy - z2 * sy;
    const z1 = x2 * sy + z2 * cy;
    const y = y1 * cx + z1 * sx;
    const z = -y1 * sx + z1 * cx;
    return [x * mx, y * my, z * mz];
  };
}

/** Do espaço do mundo para o espaço da montagem onde a peça está (desfaz as montagens, de fora para dentro). */
function toAssemblySpace(part: Part): (p: [number, number, number]) => [number, number, number] {
  const inv = assemblyChain(part.assembly)
    .map((a) => invTransformFn(a))
    .reverse();
  return (p) => inv.reduce<[number, number, number]>((q, f) => f(q[0], q[1], q[2]), p);
}

/** Posição final de um ponto da peça: a da peça e, por fora dela, a de cada montagem que a contém. */
export function worldFn(part: Part): (x: number, y: number, z: number) => [number, number, number] {
  const own = transformFn(part);
  const chain = assemblyChain(part.assembly).map((a) => transformFn(a));
  return (x, y, z) => {
    let p = own(x, y, z);
    for (const f of chain) p = f(p[0], p[1], p[2]);
    return p;
  };
}

/** Escondida por si ou por alguma montagem que a contém. */
const hiddenIn = (part: Part): boolean => !!part.hidden || assemblyChain(part.assembly).some((a) => a.hidden);

type LayoutNode = Record<string, unknown> & {
  id: number;
  row: number;
  parents: number[];
  uid: number;
  g?: number;
};
interface LayoutRes {
  stats: { nodes: number; edges: number; meanEdge: number; mode: string };
  rows: { label: string }[];
  palette: Record<string, string>;
  positions: number[];
  edges: number[];
  nodes: LayoutNode[];
  issues: unknown[];
  geomKey?: string;
  geoms?: string[];
}

export function partsCommands(
  layoutOut: (p: Params, yarnMap?: Record<string, string>, mirror?: boolean) => Record<string, unknown>,
): Record<string, Cmd> {
  return {
    /** Peças, peça ativa, rascunho de costura. */
    "parts.get": () => view(),
    /** Peça original nova e vazia (ou com `text`). */
    "parts.add": (p) => {
      addPart({
        ...(typeof p.name === "string" ? { name: p.name } : {}),
        ...(typeof p.text === "string" ? { text: p.text } : {}),
        ...(dialectOf(p.dialect) ? { dialect: dialectOf(p.dialect) as Dialect } : {}),
      });
      return view();
    },
    /** Instância de `id`: copia a original e acompanha as mudanças dela; tem posição própria. */
    "parts.instance": (p) => {
      addInstance(String(p.id), "instance");
      return view();
    },
    /** Espelhada: instância espelhada no plano `plane` (x, y ou z; padrão x). */
    "parts.mirror": (p) => {
      const plane = p.plane ?? "x";
      if (plane !== "x" && plane !== "y" && plane !== "z") throw new Error("plano deve ser x, y ou z");
      addInstance(String(p.id), "mirror", plane);
      return view();
    },
    /** Cópia: peça nova independente, com a receita, os fios, a tensão e a pintura da original. */
    "parts.copy": (p) => {
      copyPart(String(p.id));
      return view();
    },
    /** Torna uma instância ou espelhada numa peça independente (deixa de acompanhar a original). */
    "parts.detach": (p) => {
      detachPart(String(p.id));
      return view();
    },
    "parts.remove": (p) => {
      removePart(String(p.id));
      return view();
    },
    /** Muda nome, posição `pos`, rotação `rot` (graus), plano `mirror` ou troca de fios `yarnMap` ({"A":"B"}). */
    "parts.set": (p) => {
      const { id, ...patch } = p;
      patchPart(String(id), patch);
      return view();
    },
    /** Troca a receita da peça (instâncias editam a receita da original). */
    "parts.setText": (p) => {
      if (typeof p.text !== "string") throw new Error("parâmetro 'text' deve ser texto");
      setPartText(String(p.id ?? partsSnapshot().active), p.text, dialectOf(p.dialect));
      return view();
    },
    /** Confirma a receita da peça (texto estável): daí em diante os uids são realinhados a partir dela. */
    "parts.commitText": (p) => {
      const id = String(p.id ?? partsSnapshot().active);
      const ok = withPart(id, (root) => commitText(root.text, root.dialect));
      // a base mudou: quem grava no disco precisa saber, já com o estado da peça ativa (de volta do withPart)
      notifyEdit();
      return { committed: ok, ...view() };
    },
    /** Peça em edição: a receita, a seleção, as ferramentas e a pintura passam a valer para ela. */
    "parts.setActive": (p) => {
      setActive(String(p.id));
      return view();
    },
    /** Mostra ou esconde uma peça no 3D. Escondida não desenha nem recebe clique, mas continua nos materiais e nas costuras. */
    /** Montagem nova: as peças em `parts` (se vierem) entram nela; sem `parts` ela nasce vazia. */
    "assembly.add": (p) => {
      // `fromSelection`: a peça escolhida na árvore entra na montagem nova (e a montagem escolhida passa a ser a mãe)
      const sel = p.fromSelection === true ? treeSelected() : null;
      const selPart = sel && partsSnapshot().parts.some((q) => q.id === sel) ? [sel] : [];
      const selAsm = sel && partsSnapshot().assemblies.some((q) => q.id === sel) ? sel : undefined;
      if (p.parts !== undefined && !Array.isArray(p.parts))
        throw new Error("'parts' deve ser uma lista de peças");
      addAssembly({
        ...(typeof p.name === "string" ? { name: p.name } : {}),
        ...(Array.isArray(p.parts)
          ? { parts: p.parts.map(String) }
          : selPart.length
            ? { parts: selPart }
            : {}),
        ...(typeof p.parent === "string" ? { parent: p.parent } : selAsm ? { parent: selAsm } : {}),
      });
      return treeView();
    },
    /** Muda nome, posição `pos`, rotação `rot` (graus) ou `parent` (outra montagem ou null) da montagem. */
    "assembly.set": (p) => {
      const { id, ...patch } = p;
      patchAssembly(String(id), patch);
      return treeView();
    },
    /** Esconde ou mostra a montagem inteira. */
    "assembly.setVisible": (p) => {
      if (typeof p.visible !== "boolean") throw new Error("'visible' deve ser verdadeiro ou falso");
      setAssemblyHidden(asmById(String(p.id)).id, !p.visible);
      return treeView();
    },
    /** O que sairia com a montagem (montagens, peças e costuras de dentro), sem remover nada. */
    "assembly.contents": (p) => assemblyContents(String(p.id)),
    /** Remove a montagem COM tudo o que há dentro; só executa com `confirm: true` (senão devolve o que seria removido). */
    "assembly.remove": (p) => {
      const id = String(p.id);
      const what = assemblyContents(id);
      if (p.confirm !== true) {
        throw new Error(
          `remover a montagem apaga ${what.parts.length} peça(s), ${what.assemblies.length - 1} montagem(ns) de dentro e ${what.seams.length} costura(s); repita com confirm: true`,
        );
      }
      removeAssembly(id);
      return treeView();
    },
    "parts.setVisible": (p) => {
      if (typeof p.visible !== "boolean") throw new Error("'visible' deve ser verdadeiro ou falso");
      setPartsHidden({ [partById(String(p.id)).id]: !p.visible });
      return view();
    },
    /** Só esta peça fica à vista (as outras são escondidas). Esconder e mostrar ficam fora do desfazer. */
    "parts.isolate": (p) => {
      const keep = partById(String(p.id)).id;
      setPartsHidden(Object.fromEntries(partsSnapshot().parts.map((q) => [q.id, q.id !== keep])));
      return view();
    },
    /** Todas as peças voltam a aparecer. */
    "parts.showAll": () => {
      setPartsHidden(Object.fromEntries(partsSnapshot().parts.map((q) => [q.id, false])));
      return view();
    },
    /**
     * Árvore do projeto: uma raiz (`kind: "assembly"`), as peças (`part`, `instance`, `mirror`) e as costuras (`seam`),
     * cada nó com `active` (peça em edição), `visible` e, quando cabe, `source` e `ok`. G5 acrescenta montagens dentro
     * da raiz sem mudar este formato.
     */
    "tree.get": () => treeView(),
    /** Seleciona um nó da árvore (peça, costura ou "root"); selecionar uma peça também a torna a peça ativa. */
    "tree.select": (p) => {
      const id = String(p.id);
      const s = partsSnapshot();
      if (id === "root") setTreeSelected("root");
      else if (s.parts.some((q) => q.id === id)) {
        setActive(id);
        setTreeSelected(id);
      } else if (s.seams.some((q) => q.id === id) || s.assemblies.some((q) => q.id === id))
        setTreeSelected(id);
      else throw new Error(`'${id}' não está na árvore`);
      return treeView();
    },

    // --- costuras
    /** Guarda a seleção atual (uma linha contínua) como lado `side` (a ou b) do rascunho de costura. */
    "seam.draft": (p) => {
      const side = p.side;
      if (side !== "a" && side !== "b") throw new Error("'side' deve ser 'a' ou 'b'");
      const s = partsSnapshot();
      const root = rootOf(s.active);
      const eng = engineFor(root.text, root.dialect, true);
      if (!eng.ok) throw new Error("a receita tem erros: corrija-a antes de guardar o lado da costura");
      const chain = orderChain(eng.store, selectionMask(eng));
      if (!chain)
        throw new Error("a seleção não é uma linha contínua sem ramificação (use caminho, volta ou borda)");
      setDraft(side, { part: s.active, uids: chain.order.map((i) => eng.store.uid[i] as number) });
      return { ...view(), side, count: chain.order.length, closed: chain.closed };
    },
    "seam.clearDraft": () => {
      clearDraft();
      return view();
    },
    /** Confere uma costura: linhas contínuas, contagem pela proporção e pares de pontos. Aceita {a,b,reverse,ratio} ou {id}. */
    "seam.validate": (p) => {
      if (typeof p.id === "string") {
        const s = partsSnapshot().seams.find((x) => x.id === p.id);
        if (!s) throw new Error(`costura '${p.id}' não existe`);
        return checkSeam(s.a, s.b, s.reverse, s.ratio);
      }
      const d = partsSnapshot().draft;
      const a = p.a !== undefined ? sideOf(p.a, "a") : d.a;
      const b = p.b !== undefined ? sideOf(p.b, "b") : d.b;
      if (!a || !b) throw new Error("defina os dois lados (seam.draft nos lados a e b, ou passe a e b)");
      return checkSeam(a, b, p.reverse === true, ratioOf(p.ratio));
    },
    /** Cria a costura a partir do rascunho (ou de a e b explícitos), só se a validação passar. */
    "seam.add": (p) => {
      const d = partsSnapshot().draft;
      const a = p.a !== undefined ? sideOf(p.a, "a") : d.a;
      const b = p.b !== undefined ? sideOf(p.b, "b") : d.b;
      if (!a || !b) throw new Error("defina os dois lados (seam.draft nos lados a e b, ou passe a e b)");
      const reverse = p.reverse === true;
      const ratio = ratioOf(p.ratio);
      const check = checkSeam(a, b, reverse, ratio);
      if (!check.ok) throw new Error(`costura inválida: ${check.errors.join("; ")}`);
      const name =
        typeof p.name === "string" && p.name.trim()
          ? p.name.trim()
          : `Costura ${partsSnapshot().seams.length + 1}`;
      addSeam({ name, a, b, reverse, ratio, type: typeOf(p.type) });
      return { ...view(), pairs: check.pairs.length, warnings: check.warnings };
    },
    /** Altera nome, sentido (`reverse`), proporção ou tipo; a costura continua válida ou o comando falha. */
    "seam.set": (p) => {
      const s = partsSnapshot().seams.find((x) => x.id === p.id);
      if (!s) throw new Error(`costura '${String(p.id)}' não existe`);
      const patch: Partial<Pick<Seam, "name" | "reverse" | "ratio" | "type">> = {};
      if (typeof p.name === "string" && p.name.trim()) patch.name = p.name.trim();
      if (p.reverse !== undefined) patch.reverse = p.reverse === true;
      if (p.ratio !== undefined) patch.ratio = ratioOf(p.ratio);
      if (p.type !== undefined) patch.type = typeOf(p.type);
      const next = { ...s, ...patch };
      const check = checkSeam(next.a, next.b, next.reverse, next.ratio);
      if (!check.ok) throw new Error(`costura inválida: ${check.errors.join("; ")}`);
      patchSeam(s.id, patch);
      return view();
    },
    "seam.remove": (p) => {
      removeSeam(String(p.id));
      return view();
    },
    /** Costuras com o estado de cada uma (ok, avisos, erros, contagens). */
    "seam.list": () => ({
      types: SEAM_TYPE_NAMES,
      seams: partsSnapshot().seams.map((s) => {
        const c = checkSeam(s.a, s.b, s.reverse, s.ratio);
        return {
          id: s.id,
          name: s.name,
          type: s.type,
          reverse: s.reverse,
          ratio: s.ratio,
          a: { part: s.a.part, count: s.a.uids.length },
          b: { part: s.b.part, count: s.b.uids.length },
          ok: c.ok,
          errors: c.errors,
          warnings: c.warnings,
        };
      }),
    }),

    /**
     * Montagem: todas as peças com posição e rotação, e as linhas de costura entre pontos. Mesmo formato de
     * graph.layout (nós com `part`, `uid`, `rowLabel`) mais `seamLines` (pares de índices) e `parts`.
     */
    /**
     * Fecha a montagem sem física: cada peça ligada por costuras é movida e girada (corpo rígido) para que os pontos
     * costurados se encontrem, a partir de uma peça fixa (`anchor`, padrão a primeira). Com `autoFlip` (padrão)
     * escolhe o sentido da costura que deixa a peça para fora da âncora. Devolve as poses de antes, as folgas e avisos.
     */
    "assembly.close": (p) =>
      transact(() => {
        const st = partsSnapshot();
        const anchor = typeof p.anchor === "string" ? p.anchor : (st.parts[0] as Part).id;
        partById(anchor);
        const autoFlip = p.autoFlip !== false;
        const localCache = new Map<string, { pts: Map<number, V3>; centroid: V3 }>();
        const localOf = (part: Part) => {
          let c = localCache.get(part.id);
          if (!c) {
            const res = withPart(part.id, (root) =>
              layoutOut(
                { ...p, include: true, text: root.text, ...(root.dialect ? { dialect: root.dialect } : {}) },
                part.yarnMap,
                part.mirror !== undefined,
              ),
            ) as unknown as LayoutRes;
            const pts = new Map<number, V3>();
            const sum: V3 = [0, 0, 0];
            res.nodes.forEach((nd, i) => {
              const v: V3 = [
                res.positions[i * 3] as number,
                res.positions[i * 3 + 1] as number,
                res.positions[i * 3 + 2] as number,
              ];
              pts.set(nd.uid, v);
              for (let k = 0; k < 3; k++) sum[k] = (sum[k] as number) + (v[k] as number);
            });
            const n = Math.max(1, res.nodes.length);
            c = { pts, centroid: [(sum[0] as number) / n, (sum[1] as number) / n, (sum[2] as number) / n] };
            localCache.set(part.id, c);
          }
          return c;
        };
        const world = (partId: string, uid: number): V3 | null => {
          const part = partById(partId);
          const v = localOf(part).pts.get(uid);
          return v ? worldFn(part)(v[0], v[1], v[2]) : null;
        };
        const before: Record<string, { pos: number[]; rot: number[] }> = {};
        const flipped: string[] = [];
        const seamReverse: Record<string, boolean> = {};
        const skipped: string[] = [];
        const visited = new Set<string>([anchor]);
        const seamsOf = (q: string) =>
          partsSnapshot().seams.filter(
            (s) => (s.a.part === q && visited.has(s.b.part)) || (s.b.part === q && visited.has(s.a.part)),
          );
        for (let guard = 0; guard < st.parts.length + 2; guard++) {
          const next = st.parts.find((q) => !visited.has(q.id) && seamsOf(q.id).length > 0);
          if (!next) break;
          const lp = localOf(next);
          const mirror = (v: V3): V3 => [
            next.mirror === "x" ? -v[0] : v[0],
            next.mirror === "y" ? -v[1] : v[1],
            next.mirror === "z" ? -v[2] : v[2],
          ];
          const L: V3[] = [];
          const W: V3[] = [];
          const targetCentroid: V3 = [0, 0, 0];
          for (const sm of seamsOf(next.id)) {
            const nextIsA = sm.a.part === next.id;
            const try1 = (rev: boolean) => {
              const c = checkSeam(sm.a, sm.b, rev, sm.ratio);
              const l: V3[] = [];
              const w: V3[] = [];
              if (c.ok) {
                for (const [ua, ub] of c.pairs) {
                  const mine = world(nextIsA ? sm.b.part : sm.a.part, nextIsA ? ub : ua);
                  const own = lp.pts.get(nextIsA ? ua : ub);
                  if (mine && own) {
                    l.push(mirror(own));
                    w.push(mine);
                  }
                }
              }
              return { l, w, fit: l.length >= 3 ? fitRigid(l, w) : null };
            };
            const cands = autoFlip ? [sm.reverse, !sm.reverse] : [sm.reverse];
            let best: { rev: boolean; res: ReturnType<typeof try1>; score: number } | null = null;
            for (const rev of cands) {
              const res = try1(rev);
              if (!res.fit) continue;
              const seamC = mean(res.w);
              const partC = applyPose(res.fit, mirror(lp.centroid));
              const partner = partById(nextIsA ? sm.b.part : sm.a.part);
              const partnerC = worldFn(partner)(...localOf(partner).centroid);
              const outward = dot(sub(partC, seamC), sub(seamC, partnerC)) > 0;
              const score = res.fit.rms + (outward ? 0 : 1e6);
              if (!best || score < best.score) best = { rev, res, score };
            }
            if (!best) continue;
            if (best.rev !== sm.reverse) {
              seamReverse[sm.id] = sm.reverse;
              patchSeam(sm.id, { reverse: best.rev });
              flipped.push(sm.id);
            }
            L.push(...best.res.l);
            W.push(...best.res.w);
          }
          if (L.length < 3) {
            skipped.push(next.id);
            visited.add(next.id);
            continue;
          }
          // a pose da peça é dentro da montagem dela: os alvos saem do mundo para o espaço da montagem (pergunta 14)
          const fit = fitRigid(L, W.map(toAssemblySpace(next)));
          before[next.id] = { pos: [...next.pos], rot: [...next.rot] };
          patchPart(next.id, { pos: fit.t, rot: eulerOf(fit.R) });
          void targetCentroid;
          visited.add(next.id);
        }
        const gaps = partsSnapshot().seams.map((sm) => {
          const c = checkSeam(sm.a, sm.b, sm.reverse, sm.ratio);
          const d: number[] = [];
          for (const [ua, ub] of c.pairs) {
            const a = world(sm.a.part, ua);
            const b = world(sm.b.part, ub);
            if (a && b) d.push(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
          }
          return {
            id: sm.id,
            name: sm.name,
            ok: c.ok,
            meanGap: d.length ? Math.round((d.reduce((x, y) => x + y, 0) / d.length) * 100) / 100 : null,
            maxGap: d.length ? Math.round(Math.max(...d) * 100) / 100 : null,
          };
        });
        const unconnected = st.parts.filter((q) => !visited.has(q.id)).map((q) => q.id);
        const warnings: string[] = [];
        if (unconnected.length > 0) warnings.push("peças sem costura até a âncora ficaram onde estavam");
        if (skipped.length > 0)
          warnings.push(
            "peças com menos de 3 pares de pontos costurados não foram movidas (poucos pontos para fixar a posição)",
          );
        if (flipped.length > 0)
          warnings.push("o sentido de algumas costuras foi invertido para a peça ficar para fora");
        if (gaps.some((g) => (g.meanGap ?? 0) > 1)) {
          warnings.push("as peças são rígidas: onde os contornos têm tamanhos diferentes sobra folga");
        }
        return { anchor, before, flipped, seamReverse, skipped, gaps, unconnected, warnings, ...view() };
      }),

    /** Desfaz o fechamento: devolve as poses e o sentido das costuras (valores devolvidos por assembly.close). */
    "assembly.undoClose": (p) =>
      transact(() => {
        const before = (p.before ?? {}) as Record<string, { pos: number[]; rot: number[] }>;
        const rev = (p.seamReverse ?? {}) as Record<string, boolean>;
        for (const [id, pose] of Object.entries(before)) patchPart(id, { pos: pose.pos, rot: pose.rot });
        for (const [id, reverse] of Object.entries(rev)) patchSeam(id, { reverse });
        return view();
      }),

    "assembly.layout": (p) => {
      const s = partsSnapshot();
      const positions: number[] = [];
      const edges: number[] = [];
      const nodes: Record<string, unknown>[] = [];
      const index = new Map<string, Map<number, number>>();
      const partsOut: { id: string; name: string; offset: number; count: number; error: string | null }[] =
        [];
      let palette: Record<string, string> = {};
      let rows: { label: string }[] = [];
      let edgeSum = 0;
      const geomParts: string[] = [];
      // modelos de ponto de todas as peças numa lista só (cada nó guarda o índice dela)
      const geoms: string[] = [];
      const geomIdx = new Map<string, number>();
      for (const part of s.parts) {
        const base = nodes.length;
        if (hiddenIn(part)) {
          // escondida: fora do desenho e do clique; as outras peças seguem com os índices dela de fora
          partsOut.push({ id: part.id, name: part.name, offset: base, count: 0, error: null });
          continue;
        }
        let res: LayoutRes;
        try {
          res = withPart(part.id, (root) =>
            layoutOut(
              { ...p, include: true, text: root.text, ...(root.dialect ? { dialect: root.dialect } : {}) },
              part.yarnMap,
              part.mirror !== undefined,
            ),
          ) as unknown as LayoutRes;
        } catch (e) {
          partsOut.push({
            id: part.id,
            name: part.name,
            offset: base,
            count: 0,
            error: (e as Error).message,
          });
          continue;
        }
        geomParts.push(`${res.geomKey ?? ""}${JSON.stringify([part.pos, part.rot, part.mirror ?? null])}`);
        const tf = worldFn(part);
        const n = res.nodes.length;
        for (let i = 0; i < n; i++) {
          const [x, y, z] = tf(
            res.positions[i * 3] as number,
            res.positions[i * 3 + 1] as number,
            res.positions[i * 3 + 2] as number,
          );
          positions.push(x, y, z);
        }
        for (const e of res.edges) edges.push(e + base);
        const gmap = (res.geoms ?? []).map((k) => {
          let i = geomIdx.get(k);
          if (i === undefined) {
            i = geoms.length;
            geoms.push(k);
            geomIdx.set(k, i);
          }
          return i;
        });
        const map = new Map<number, number>();
        for (const nd of res.nodes) {
          map.set(nd.uid, base + nd.id);
          nodes.push({
            ...nd,
            id: base + nd.id,
            parents: nd.parents.map((q) => q + base),
            g: gmap[nd.g ?? 0] ?? 0,
            part: part.id,
            rowLabel: nd.row >= 0 ? (res.rows[nd.row]?.label ?? null) : null,
          });
        }
        index.set(part.id, map);
        edgeSum += res.stats.meanEdge * (res.edges.length / 2);
        palette = res.palette;
        if (part.id === s.active) rows = res.rows;
        partsOut.push({ id: part.id, name: part.name, offset: base, count: n, error: null });
      }
      if (rows.length === 0) {
        const activeLast = partsOut.find((q) => q.id === s.active);
        if (!activeLast) rows = [];
      }
      const seamLines: number[] = [];
      const seamColor = getSettings().yarns.seam.colorHex;
      const seamCurves: { id: string; name: string; color: string; type: string; pairs: number[] }[] = [];
      const seamsOut: { id: string; name: string; ok: boolean; pairs: number }[] = [];
      for (const sm of s.seams) {
        const c = checkSeam(sm.a, sm.b, sm.reverse, sm.ratio);
        let drawn = 0;
        const curve: number[] = [];
        for (const [ua, ub] of c.pairs) {
          const ia = index.get(sm.a.part)?.get(ua);
          const ib = index.get(sm.b.part)?.get(ub);
          if (ia !== undefined && ib !== undefined) {
            seamLines.push(ia, ib);
            curve.push(ia, ib);
            drawn++;
          }
        }
        seamsOut.push({ id: sm.id, name: sm.name, ok: c.ok, pairs: drawn });
        seamCurves.push({ id: sm.id, name: sm.name, color: seamColor, type: sm.type, pairs: curve });
      }
      return {
        stats: {
          nodes: nodes.length,
          edges: edges.length / 2,
          meanEdge: edges.length > 0 ? edgeSum / (edges.length / 2) : 0,
          mode: "montagem",
        },
        rows,
        palette,
        positions: positions.map((v) => Math.round(v * 1000) / 1000),
        edges,
        nodes,
        seamLines,
        seamCurves,
        geoms,
        geomKey: `${geomParts.join("§")}|${geoms.join(",")}`,
        parts: partsOut,
        seams: seamsOut,
        active: s.active,
      };
    },
  };
}

// ------------------------------------------------------------------ ajuste de corpo rígido (Horn, 1987)

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mean = (pts: V3[]): V3 => {
  const s: V3 = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) s[k] = (s[k] as number) + (p[k] as number);
  const n = Math.max(1, pts.length);
  return [s[0] / n, s[1] / n, s[2] / n];
};

type Mat = [V3, V3, V3];
interface Fit {
  R: Mat;
  t: V3;
  rms: number;
}

const applyPose = (f: Fit, v: V3): V3 => [
  f.R[0][0] * v[0] + f.R[0][1] * v[1] + f.R[0][2] * v[2] + f.t[0],
  f.R[1][0] * v[0] + f.R[1][1] * v[1] + f.R[1][2] * v[2] + f.t[1],
  f.R[2][0] * v[0] + f.R[2][1] * v[1] + f.R[2][2] * v[2] + f.t[2],
];

/** Autovetor do maior autovalor de uma matriz simétrica 4x4 (Jacobi cíclico). */
function topEigen4(m: number[][]): number[] {
  const a = m.map((row) => [...row]);
  const v = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) off += ((a[i] as number[])[j] as number) ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 4; q++) {
        const apq = (a[p] as number[])[q] as number;
        if (Math.abs(apq) < 1e-30) continue;
        const theta = (((a[q] as number[])[q] as number) - ((a[p] as number[])[p] as number)) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 4; k++) {
          const akp = (a[k] as number[])[p] as number;
          const akq = (a[k] as number[])[q] as number;
          (a[k] as number[])[p] = c * akp - s * akq;
          (a[k] as number[])[q] = s * akp + c * akq;
        }
        for (let k = 0; k < 4; k++) {
          const apk = (a[p] as number[])[k] as number;
          const aqk = (a[q] as number[])[k] as number;
          (a[p] as number[])[k] = c * apk - s * aqk;
          (a[q] as number[])[k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = (v[k] as number[])[p] as number;
          const vkq = (v[k] as number[])[q] as number;
          (v[k] as number[])[p] = c * vkp - s * vkq;
          (v[k] as number[])[q] = s * vkp + c * vkq;
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 4; i++)
    if (((a[i] as number[])[i] as number) > ((a[best] as number[])[best] as number)) best = i;
  return [0, 1, 2, 3].map((k) => (v[k] as number[])[best] as number);
}

/** Rotação R e translação t que levam os pontos L sobre W com o menor erro quadrático. */
export function fitRigid(L: V3[], W: V3[]): Fit {
  const cl = mean(L);
  const cw = mean(W);
  const S = [0, 1, 2].map(() => [0, 0, 0]);
  for (let i = 0; i < L.length; i++) {
    const l = sub(L[i] as V3, cl);
    const w = sub(W[i] as V3, cw);
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++)
        (S[a] as number[])[b] = ((S[a] as number[])[b] as number) + (l[a] as number) * (w[b] as number);
  }
  const g = (a: number, b: number) => (S[a] as number[])[b] as number;
  const N = [
    [g(0, 0) + g(1, 1) + g(2, 2), g(1, 2) - g(2, 1), g(2, 0) - g(0, 2), g(0, 1) - g(1, 0)],
    [g(1, 2) - g(2, 1), g(0, 0) - g(1, 1) - g(2, 2), g(0, 1) + g(1, 0), g(2, 0) + g(0, 2)],
    [g(2, 0) - g(0, 2), g(0, 1) + g(1, 0), -g(0, 0) + g(1, 1) - g(2, 2), g(1, 2) + g(2, 1)],
    [g(0, 1) - g(1, 0), g(2, 0) + g(0, 2), g(1, 2) + g(2, 1), -g(0, 0) - g(1, 1) + g(2, 2)],
  ];
  const [qw, qx, qy, qz] = topEigen4(N) as [number, number, number, number];
  const R: Mat = [
    [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy)],
    [2 * (qx * qy + qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qw * qx)],
    [2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), 1 - 2 * (qx * qx + qy * qy)],
  ];
  const rot = (v: V3): V3 => [
    R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
    R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
    R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
  ];
  const rc = rot(cl);
  const t: V3 = [cw[0] - rc[0], cw[1] - rc[1], cw[2] - rc[2]];
  let err = 0;
  for (let i = 0; i < L.length; i++) {
    const m = rot(L[i] as V3);
    const d = [m[0] + t[0] - (W[i] as V3)[0], m[1] + t[1] - (W[i] as V3)[1], m[2] + t[2] - (W[i] as V3)[2]];
    err += (d[0] as number) ** 2 + (d[1] as number) ** 2 + (d[2] as number) ** 2;
  }
  return { R, t, rms: Math.sqrt(err / L.length) };
}

/** Ângulos (graus) X, Y, Z tais que R = Rz * Ry * Rx, como em transformFn. */
export function eulerOf(R: Mat): V3 {
  const r = (i: 0 | 1 | 2, j: 0 | 1 | 2) => R[i][j];
  const ay = Math.asin(Math.max(-1, Math.min(1, -r(2, 0))));
  let ax: number;
  let az: number;
  if (Math.abs(Math.cos(ay)) > 1e-6) {
    ax = Math.atan2(r(2, 1), r(2, 2));
    az = Math.atan2(r(1, 0), r(0, 0));
  } else {
    ax = Math.atan2(-r(1, 2), r(1, 1));
    az = 0;
  }
  const d = (x: number) => Math.round(((x * 180) / Math.PI) * 1000) / 1000;
  return [d(ax), d(ay), d(az)];
}
