// SPDX-License-Identifier: GPL-3.0-or-later
// Diagrama de nós esquemático do criador de pontos (etapa C, docs/16): as alças na agulha e os laços já fechados, lidos
// dos eventos da máquina de estados. Por cima/por baixo vem da ordem de desenho (costas do anel, fio, frente do anel com
// halo), não de cálculo de cruzamentos; a ligação "o fio passa por este anel" vem do layout: cada laço fechado tem a sua
// faixa, e o fio de um laço só passa pelos furos dos laços que ele atravessou. Puro: mesma entrada, mesma string SVG.
import { stitchBuilder as B } from "@novelo/core";

const BG = "#faf7ef";
const COLOR: Record<B.LoopKind, string> = { initial: "#6b7280", yo: "#c2410c", pulled: "#2d6a4f" };
const BASE_COLOR = "#9ca3af";
/** Espaço entre as alças na agulha; as casas ficam entre as faixas (meia faixa de diferença), longe dos furos. */
const SLOT = 60;
const HOOK_Y = 80;
const HOOK_RY = 20;
const CLOSED_RX = 15;
const CLOSED_RY = 6;
/** Distância vertical do fundo de um laço ao primeiro laço que o fio dele atravessa. */
const LEVEL = 26;
/** Degrau vertical entre laços sucessivos do mesmo fio. */
const ROW = 14;
const BASE_X0 = 60;
/** Os V das bases ficam meia coluna à direita das faixas: nenhum anel fechado cai sobre um V; só as pernas ligam anel e base. */
const BASE_SHIFT = 30;
/** Largura de uma faixa (folha da árvore); no mínimo 2 × CLOSED_RX mais folga. */
const LANE_W = 60;
const STRAND_W = 5;
/** Distância entre as duas linhas de uma perna (U); constante em todo o desenho. */
const GAP = 12;
const HALF = GAP / 2;
/** Passo entre pernas vizinhas (pistas e casas do V): GAP + traço + folga. */
const PITCH = GAP + STRAND_W + 6;

export interface StitchDiagramOptions {
  /** Quantas bases (topos da carreira de baixo) desenhar. Padrão: o maior entre 5 e (maior base usada + 2). */
  bases?: number;
  /** Texto no canto superior esquerdo. */
  caption?: string;
  /**
   * Mão que segura a agulha. "right" (padrão): ponta da agulha à esquerda e cabo à direita, a base 0 na direita e as
   * demais crescendo para a esquerda (4 3 2 1 0). "left": o espelho exato desse desenho.
   */
  hand?: "right" | "left";
}

interface Info {
  id: number;
  kind: B.LoopKind;
  base?: number;
}

interface Draw {
  top: number;
  through: number[];
  level: number;
}

interface Pos {
  x: number;
  y: number;
}

const f = (v: number): string => v.toFixed(1);
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Reconstrói, pelos eventos, o tipo de cada alça, os `draw` (quem puxou, por quais alças) e o pico de alças na agulha. */
function history(state: B.BuilderState): { info: Map<number, Info>; draws: Draw[]; peak: number } {
  const info = new Map<number, Info>([[0, { id: 0, kind: "initial" }]]);
  let list = [0];
  let peak = 1;
  const draws: Draw[] = [];
  for (const e of state.events) {
    if (e.added !== undefined) {
      const c = e.cmd;
      info.set(
        e.added,
        c.kind === "insert" && c.base !== undefined
          ? { id: e.added, kind: "pulled", base: c.base }
          : { id: e.added, kind: "yo" },
      );
      list = [...list, e.added];
      peak = Math.max(peak, list.length);
    } else if (e.through) {
      draws.push({ top: list[list.length - 1] as number, through: e.through, level: draws.length + 1 });
      const gone = new Set(e.through);
      list = list.filter((id) => !gone.has(id));
    }
  }
  return { info, draws, peak };
}

/** Laço fechado (elipse deitada, o fio passa na vertical): costas = metade de cima, frente = metade de baixo. */
const closedArc = (c: Pos, front: boolean): string =>
  `M ${f(c.x - CLOSED_RX)} ${f(c.y)} A ${CLOSED_RX} ${CLOSED_RY} 0 0 ${front ? 0 : 1} ${f(c.x + CLOSED_RX)} ${f(c.y)}`;

export function stitchDiagramSvg(state: B.BuilderState, opts: StitchDiagramOptions = {}): string {
  const { info, draws, peak } = history(state);
  const bases = B.basesOf(state.cmds);
  const maxBase = bases.length ? Math.max(...bases) : -1;
  const nb = Math.max(opts.bases ?? 5, maxBase + 2);

  // árvore: o fio de um laço atravessa, na ordem, os laços que os seus `draw` fecharam (os "filhos" dele)
  const children = new Map<number, number[]>();
  for (const d of draws) children.set(d.top, [...(children.get(d.top) ?? []), ...d.through]);

  // faixas: cada folha tem a sua; um laço com filhos fica na faixa do primeiro filho, os outros filhos vêm depois
  const laneOf = new Map<number, number>();
  let nextLane = 0;
  const assign = (id: number): number => {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      laneOf.set(id, nextLane);
      return nextLane++;
    }
    // quem puxou uma alça da base e ainda tem filhos fica numa faixa só dele: as pernas descem por ela sem passar pelo
    // furo do primeiro filho
    const own = (info.get(id) as Info).kind === "pulled" ? nextLane++ : -1;
    let first = 0;
    for (const [i, k] of kids.entries()) {
      const l = assign(k);
      if (i === 0) first = l;
    }
    laneOf.set(id, own >= 0 ? own : first);
    return own >= 0 ? own : first;
  };
  const roots = state.loops.map((l) => l.id);
  for (const r of roots) for (const k of children.get(r) ?? []) assign(k);

  // alturas: os filhos descem em degraus a partir do fundo do pai; cada subárvore pende da sua faixa
  const closed = new Map<number, Pos>();
  let maxY = HOOK_Y + HOOK_RY;
  const place = (id: number, bottom: number): void => {
    for (const [i, k] of (children.get(id) ?? []).entries()) {
      const y = bottom + LEVEL + ROW * i;
      closed.set(k, { x: BASE_X0 + (laneOf.get(k) as number) * LANE_W, y });
      maxY = Math.max(maxY, y + CLOSED_RY);
      place(k, y + CLOSED_RY);
    }
  };
  for (const r of roots) place(r, HOOK_Y + HOOK_RY);

  // A coluna de cada base alarga para caber o leque das suas pernas: o espaço entre duas bases é múltiplo de 60 (assim os
  // V continuam longe das faixas e das casas da agulha) e deixa no mínimo PITCH entre a última casa de uma e a primeira
  // da seguinte.
  const pulledPerBase = new Map<number, number>();
  for (const id of new Set([...state.loops.map((l) => l.id), ...closed.keys()])) {
    const inf = info.get(id) as Info;
    if (inf.kind === "pulled" && inf.base !== undefined) {
      pulledPerBase.set(inf.base, (pulledPerBase.get(inf.base) ?? 0) + 1);
    }
  }
  const fan = (b: number): number => (Math.max(1, pulledPerBase.get(b) ?? 0) - 1) * PITCH;
  const baseCenters: number[] = [BASE_X0 + BASE_SHIFT];
  for (let b = 1; b < nb; b++) {
    const gap = 60 * Math.ceil(((fan(b - 1) + fan(b)) / 2 + PITCH) / 60);
    baseCenters.push((baseCenters[b - 1] as number) + gap);
  }
  const baseX = (b: number): number => baseCenters[b] as number;

  // largura múltipla de 60: as casas da agulha, ancoradas na ponta, ficam sempre a 30 px das faixas
  const width =
    Math.ceil(
      Math.max(
        320,
        (baseCenters[nb - 1] as number) + BASE_X0,
        BASE_X0 + Math.max(0, nextLane - 1) * LANE_W + 60,
        30 + (peak - 1) * SLOT + 130,
      ) / 60,
    ) * 60;

  // Tudo é calculado no desenho da mão esquerda (ponta da agulha à direita) e espelhado na saída (x -> largura - x) na
  // mão direita. As alças da agulha ficam ancoradas na ponta: a mais nova está na ponta e as mais antigas deslizam
  // 60 px em direção ao cabo a cada alça nova (e de volta quando um `draw` as remove).
  const mirrored = (opts.hand ?? "right") === "right";
  const X = (x: number): number => (mirrored ? width - x : x);
  const onHook = new Map<number, Pos>();
  for (const [i, l] of state.loops.entries()) {
    onHook.set(l.id, { x: width - 30 - (state.loops.length - 1 - i) * SLOT, y: HOOK_Y });
  }
  const centerOf = (id: number): Pos => (onHook.get(id) ?? closed.get(id)) as Pos;
  const isHook = (id: number): boolean => onHook.has(id);
  const ids = [...info.keys()].filter((id) => onHook.has(id) || closed.has(id)).sort((a, b) => a - b);

  // Pernas: cada alça puxada de uma base é um U comprido. Os dois braços descem da alça (da agulha ou do fundo do anel) a
  // GAP um do outro, atravessam numa pista própria abaixo de todos os anéis e entram na base na sua casa do V; a curva
  // do U fica por baixo do V. Só há trechos retos (horizontais e verticais), então o deslocamento ±GAP/2 da linha central
  // mantém a distância entre os braços constante e nada se sobrepõe.
  interface Pair {
    id: number;
    base: number;
    drop: number;
    y0: number;
    land: number;
    track: number;
  }
  const pairs: Pair[] = [];
  const byBase = new Map<number, number[]>();
  for (const id of ids) {
    const inf = info.get(id) as Info;
    if (inf.kind === "pulled" && inf.base !== undefined)
      byBase.set(inf.base, [...(byBase.get(inf.base) ?? []), id]);
  }
  const vHalf = new Map<number, number>();
  for (const [b, list] of byBase) {
    list.sort((p, q) => centerOf(p).x - centerOf(q).x || p - q);
    vHalf.set(b, Math.max(14, ((list.length - 1) * PITCH) / 2 + HALF + STRAND_W + 4));
    for (const [i, id] of list.entries()) {
      const c = centerOf(id);
      pairs.push({
        id,
        base: b,
        drop: c.x,
        y0: isHook(id) ? HOOK_Y : c.y + CLOSED_RY,
        land: baseX(b) + (i - (list.length - 1) / 2) * PITCH,
        track: -1,
      });
    }
  }
  // Ordem das pistas, de cima para baixo. Regra: quanto mais longe da base a alça cai, mais baixa a pista (sem cruzar dentro
  // da mesma base). Restrição: se a casa de entrada de B fica a menos de PITCH da descida de A, a pista de B é mais baixa
  // que a de A, senão o trecho vertical de B (que começa na sua pista) se sobreporia ao de A (que termina na pista dele).
  const dist = (p: Pair): number => Math.abs(p.land - p.drop);
  const todo = pairs.filter((p) => dist(p) > 0.5).sort((p, q) => dist(p) - dist(q) || p.id - q.id);
  const tracked: Pair[] = [];
  while (todo.length > 0) {
    // o primeiro (pela regra) a que nenhum outro ainda sem pista precisa vir antes; se houver ciclo, o primeiro da fila
    const k = todo.findIndex((b) => todo.every((a) => a === b || Math.abs(a.drop - b.land) >= PITCH));
    tracked.push(...todo.splice(Math.max(k, 0), 1));
  }
  for (const [i, p] of tracked.entries()) p.track = i;

  const railY = maxY + 24;
  const baseY = railY + 24 + tracked.length * PITCH;
  const curveY = baseY + HALF;
  const height = baseY + 44;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(width)} ${f(height)}" width="${f(width)}" height="${f(height)}" font-family="sans-serif">`,
    `<rect width="100%" height="100%" fill="${BG}"/>`,
  );
  if (opts.caption) out.push(`<text x="12" y="24" font-size="15" fill="#1f2937">${esc(opts.caption)}</text>`);
  out.push(
    `<text x="${f(width - 12)}" y="24" font-size="13" text-anchor="end" fill="#4b5563">alças: ${state.loops.length}</text>`,
  );
  for (let b = 0; b < nb; b++) {
    out.push(
      `<text x="${f(X(baseX(b)))}" y="${f(baseY + 30)}" font-size="11" text-anchor="middle" fill="#6b7280">base ${b}</text>`,
    );
  }

  // Deslocamento de uma polilinha ortogonal por `d`, com quinas em ângulo reto (a distância entre as duas linhas é 2d).
  const offset = (pts: Pos[], d: number): Pos[] => {
    const ls = pts.slice(0, -1).map((p, i) => {
      const q = pts[i + 1] as Pos;
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const dir = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
      return { p: { x: p.x - dir.y * d, y: p.y + dir.x * d }, dir };
    });
    const res: Pos[] = [(ls[0] as (typeof ls)[0]).p];
    for (let i = 1; i < ls.length; i++) {
      const [a, b] = [ls[i - 1] as (typeof ls)[0], ls[i] as (typeof ls)[0]];
      const det = a.dir.x * b.dir.y - a.dir.y * b.dir.x;
      const t = ((b.p.x - a.p.x) * b.dir.y - (b.p.y - a.p.y) * b.dir.x) / det;
      res.push({ x: a.p.x + a.dir.x * t, y: a.p.y + a.dir.y * t });
    }
    const last = pts[pts.length - 1] as Pos;
    const end = ls[ls.length - 1] as (typeof ls)[0];
    res.push({ x: last.x - end.dir.y * d, y: last.y + end.dir.x * d });
    return res;
  };

  const legs: string[] = [];
  const armBack = new Map<number, string>();
  const armFront = new Map<number, string>();
  const curves: string[] = [];
  for (const p of pairs) {
    const hook = isHook(p.id);
    const mid: Pos[] = [{ x: p.drop, y: p.y0 }];
    if (p.track >= 0) {
      const ty = railY + 12 + p.track * PITCH;
      mid.push({ x: p.drop, y: ty }, { x: p.land, y: ty });
    }
    mid.push({ x: p.land, y: curveY });
    for (const [side, d] of [
      ["back", HALF],
      ["front", -HALF],
    ] as const) {
      const line = offset(mid, d);
      for (let k = 0; k + 1 < line.length; k++) {
        const [a, b] = [line[k] as Pos, line[k + 1] as Pos];
        const arm =
          hook && k === 0
            ? ` data-loop="${p.id}" data-kind="pulled" data-on-hook="1" data-part="${side}" data-cx="${f(X(p.drop))}" data-cy="${HOOK_Y}"`
            : "";
        const el = `<line data-leg="${p.id}" data-base="${p.base}" data-side="${side}" data-seg="${k}"${arm} x1="${f(X(a.x))}" y1="${f(a.y)}" x2="${f(X(b.x))}" y2="${f(b.y)}" stroke="${COLOR.pulled}" stroke-width="${STRAND_W}" stroke-linecap="round"/>`;
        if (arm && side === "back") armBack.set(p.id, el);
        else if (arm) {
          // a frente do braço leva um halo na cor do fundo: corta a agulha que passa por trás dela
          armFront.set(
            p.id,
            `<line x1="${f(X(a.x))}" y1="${f(a.y)}" x2="${f(X(b.x))}" y2="${f(b.y)}" stroke="${BG}" stroke-width="${STRAND_W + 5}" stroke-linecap="butt"/>${el}`,
          );
        } else legs.push(el);
      }
    }
    curves.push(
      `<path data-leg-curve="${p.id}" data-base="${p.base}" d="M ${f(X(p.land - HALF))} ${f(curveY)} A ${HALF} ${HALF} 0 0 ${mirrored ? 1 : 0} ${f(X(p.land + HALF))} ${f(curveY)}" fill="none" stroke="${COLOR.pulled}" stroke-width="${STRAND_W}" stroke-linecap="round"/>`,
    );
  }
  out.push(...legs, ...curves);

  // bases (topos da carreira de baixo): por cima das curvas, então a alça puxada passa por baixo do V
  for (let b = 0; b < nb; b++) {
    const x = X(baseX(b));
    const hw = vHalf.get(b) ?? 14;
    out.push(
      `<path data-base-top="${b}" data-cx="${f(x)}" data-hw="${f(hw)}" d="M ${f(x - hw)} ${f(baseY - 14)} L ${f(x)} ${f(baseY)} L ${f(x + hw)} ${f(baseY - 14)}" fill="none" stroke="${BASE_COLOR}" stroke-width="${STRAND_W}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }

  // Alça na agulha que não veio de uma base: um U pendurado na agulha (metade de trás e metade da frente).
  const uHalf = (c: Pos, front: boolean): string => {
    const x = (v: number): string => f(X(v));
    const sweep = mirrored ? 1 : 0;
    return front
      ? `M ${x(c.x)} ${f(c.y + HOOK_RY)} A ${HALF} ${HALF} 0 0 ${sweep} ${x(c.x + HALF)} ${f(c.y + HOOK_RY - HALF)} L ${x(c.x + HALF)} ${f(c.y)}`
      : `M ${x(c.x - HALF)} ${f(c.y)} L ${x(c.x - HALF)} ${f(c.y + HOOK_RY - HALF)} A ${HALF} ${HALF} 0 0 ${sweep} ${x(c.x)} ${f(c.y + HOOK_RY)}`;
  };

  const ring = (id: number, front: boolean): string => {
    const inf = info.get(id) as Info;
    const c = centerOf(id);
    const hook = isHook(id);
    // a alça puxada que está na agulha é o U comprido: os braços são as primeiras peças das pernas
    if (hook && inf.kind === "pulled" && inf.base !== undefined)
      return (front ? armFront : armBack).get(id) ?? "";
    const m: Pos = { x: X(c.x), y: c.y };
    const d = hook ? uHalf(c, front) : closedArc(m, front);
    const attrs = `data-loop="${id}" data-kind="${inf.kind}" data-on-hook="${hook ? 1 : 0}" data-part="${front ? "front" : "back"}" data-cx="${f(m.x)}" data-cy="${f(m.y)}"`;
    const draw = `<path ${attrs} d="${d}" fill="none" stroke="${COLOR[inf.kind]}" stroke-width="${STRAND_W}" stroke-linecap="round"/>`;
    // a frente leva um halo na cor do fundo: corta o que passa por trás dela
    return front
      ? `<path d="${d}" fill="none" stroke="${BG}" stroke-width="${STRAND_W + 5}" stroke-linecap="butt"/>${draw}`
      : draw;
  };

  // 1) costas dos anéis, 2) agulha, 3) fios, 4) frentes dos anéis: o fio passa entre as costas e a frente
  for (const id of ids) out.push(ring(id, false));
  // agulha: corpo, cabo (grosso, na ponta oposta aos laços) e a pontinha do gancho, no lado da ponta
  out.push(
    `<line data-hook="1" x1="${f(X(16))}" y1="${HOOK_Y}" x2="${f(X(width - 16))}" y2="${HOOK_Y}" stroke="#374151" stroke-width="7" stroke-linecap="round"/>`,
    `<line data-hook-handle="1" x1="${f(X(10))}" y1="${HOOK_Y}" x2="${f(X(80))}" y2="${HOOK_Y}" stroke="#6b7280" stroke-width="15" stroke-linecap="round"/>`,
    `<path data-hook-tip="1" d="M ${f(X(width - 18))} ${HOOK_Y} L ${f(X(width - 6))} ${HOOK_Y} L ${f(X(width - 12))} ${HOOK_Y + 9}" fill="none" stroke="#374151" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
  // o fio de cada laço sai do fundo dele, passa pelo centro de cada anel na ordem de `through` e sai pela frente do último
  const resume = new Map<number, Pos>();
  for (const d of draws) {
    const top = centerOf(d.top);
    let from = resume.get(d.top) ?? { x: top.x, y: top.y + (isHook(d.top) ? HOOK_RY : CLOSED_RY) };
    const color = COLOR[(info.get(d.top) as Info).kind];
    const seg = (a: Pos, b: Pos, extra: string): string =>
      `<line data-strand="${d.top}" data-draw="${d.level}" ${extra} x1="${f(X(a.x))}" y1="${f(a.y)}" x2="${f(X(b.x))}" y2="${f(b.y)}" stroke="${color}" stroke-width="${STRAND_W}" stroke-linecap="round"/>`;
    for (const id of d.through) {
      const c = centerOf(id);
      out.push(seg(from, c, `data-through="${id}"`));
      from = c;
    }
    const exit: Pos = { x: from.x, y: from.y + CLOSED_RY + 4 };
    out.push(seg(from, exit, `data-exit="1"`));
    resume.set(d.top, exit);
  }
  for (const id of ids) out.push(ring(id, true));
  out.push("</svg>");
  return out.join("\n");
}
