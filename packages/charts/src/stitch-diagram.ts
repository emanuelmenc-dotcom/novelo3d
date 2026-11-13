// SPDX-License-Identifier: GPL-3.0-or-later
// Diagrama de nós esquemático do criador de pontos (etapa C, docs/16): as alças na agulha e os laços já fechados, lidos
// dos eventos da máquina de estados. Cada alça é um fio em duas linhas (GAP uma da outra): na agulha o fio passa por cima
// dela, com uma linha atrás e outra na frente; as duas linhas descem pelos anéis que a alça atravessou e, se ela veio de
// uma base, até a base. Por cima/por baixo vem da ordem de desenho (costas, agulha, fios, frentes com halo), não de
// cálculo de cruzamentos; a ligação "o fio passa por este anel" vem do layout. Puro: mesma entrada, mesma string SVG.
import { stitchBuilder as B } from "@novelo/core";

const BG = "#faf7ef";
const COLOR: Record<B.LoopKind, string> = { initial: "#6b7280", yo: "#c2410c", pulled: "#2d6a4f" };
const BASE_COLOR = "#9ca3af";
/** Espaço entre as alças na agulha; as casas ficam entre as faixas (meia faixa de diferença), longe dos furos. */
const SLOT = 80;
const HOOK_Y = 80;
/** Até onde (abaixo da agulha) descem, abertas, as duas linhas de uma alça que só fica na agulha. */
const HOOK_RY = 20;
const STRAND_W = 5;
/** Distância entre as duas linhas de um fio; constante em todo o desenho. */
const GAP = 12;
const HALF = GAP / 2;
/** Passo entre fios vizinhos (pistas e casas do V): GAP + traço + folga. */
const PITCH = GAP + STRAND_W + 6;
/** Onde o fio dobra por cima da agulha: a dobra fica acima dela e as duas linhas descem, uma de cada lado. */
const BEND_Y = HOOK_Y - 8;
/** Alça fechada: um U de lado (a elipse é o símbolo da corrente), com o mesmo raio GAP/2 da alça na agulha. */
const CLOSED_RY = 6;
/**
 * O U fica com o círculo (a curva) a BOWL_DX do centro da faixa e os braços (as duas linhas da própria alça) vão ARM para
 * o lado da ponta; o fio que atravessa o U passa por dentro dele, com uma linha no centro do círculo e a outra GAP ao lado.
 */
const BOWL_DX = -16;
const ARM = 32;
/** Altura da primeira camada de anéis abaixo da agulha, e distância de uma camada à seguinte (a partir da última linha). */
const FIRST = 42;
const LEVEL = 56;
/** Distância entre as linhas de anéis de uma mesma camada: todo anel tem a sua altura, então nenhuma pista se encosta. */
const ROW = 48;
/** Folga acima de cada anel para a pista horizontal do fio que vai entrar nele. */
const ENTER = 24;
const BASE_X0 = 80;
/** Os V das bases ficam meia coluna à direita das faixas: nenhum anel fechado cai sobre um V; só os fios ligam anel e base. */
const BASE_SHIFT = 40;
/** Largura de uma faixa (folha da árvore); no mínimo a largura de um U fechado mais folga. */
const LANE_W = 80;

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

/** Caminho (linha central) do fio de uma alça; as duas linhas são o deslocamento de ±GAP/2 dele. */
interface Path {
  id: number;
  pts: Pos[];
  /** Por trecho: número do `draw` a que ele pertence (fio que atravessa anéis); null nas pernas e nos braços soltos. */
  tags: (number | null)[];
  /** Por trecho: anel que ele atravessa. */
  through: (number | null)[];
  /** Índice do primeiro trecho que já é perna (da última passagem por anéis até a base). */
  legFrom: number;
  base?: number;
  /** Onde a perna começa a descer para a pista (x) e em que altura (y). */
  drop: number;
  land: number;
  track: number;
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

type Line = { p: Pos; dir: Pos };

/**
 * Deslocamento de uma polilinha ortogonal por `d`, com quinas em ângulo reto: a distância entre as duas linhas (d e -d)
 * é 2d em todos os trechos. Trechos seguidos na mesma direção são aceitos.
 */
function offset(pts: Pos[], d: number): Pos[] {
  const ls: Line[] = pts.slice(0, -1).map((p, i) => {
    const q = pts[i + 1] as Pos;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const dir = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
    return { p: { x: p.x - dir.y * d, y: p.y + dir.x * d }, dir };
  });
  const res: Pos[] = [(ls[0] as Line).p];
  for (let i = 1; i < ls.length; i++) {
    const [a, b] = [ls[i - 1] as Line, ls[i] as Line];
    const det = a.dir.x * b.dir.y - a.dir.y * b.dir.x;
    if (Math.abs(det) < 1e-9) {
      const q = pts[i] as Pos;
      res.push({ x: q.x - a.dir.y * d, y: q.y + a.dir.x * d });
      continue;
    }
    const t = ((b.p.x - a.p.x) * b.dir.y - (b.p.y - a.p.y) * b.dir.x) / det;
    res.push({ x: a.p.x + a.dir.x * t, y: a.p.y + a.dir.y * t });
  }
  const last = pts[pts.length - 1] as Pos;
  const end = ls[ls.length - 1] as Line;
  res.push({ x: last.x - end.dir.y * d, y: last.y + end.dir.x * d });
  return res;
}

export function stitchDiagramSvg(state: B.BuilderState, opts: StitchDiagramOptions = {}): string {
  const { info, draws, peak } = history(state);
  const bases = B.basesOf(state.cmds);
  const maxBase = bases.length ? Math.max(...bases) : -1;
  const nb = Math.max(opts.bases ?? 5, maxBase + 2);

  // árvore: o fio de um laço atravessa, na ordem, os laços que os seus `draw` fecharam (os "filhos" dele)
  const children = new Map<number, number[]>();
  const levelOf = new Map<number, number>();
  for (const d of draws) {
    children.set(d.top, [...(children.get(d.top) ?? []), ...d.through]);
    for (const id of d.through) levelOf.set(id, d.level);
  }

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
  // A ordem dos anéis é a da agulha no momento em que foram puxados: o mais perto da ponta (o primeiro do `draw`) fica do
  // lado da ponta. No desenho da mão esquerda a ponta está à direita, então o primeiro filho recebe a faixa mais à direita.
  const laneX = (lane: number): number => BASE_X0 + (nextLane - 1 - lane) * LANE_W;

  // Alturas, em camadas por profundidade (filhos da agulha, netos, ...). Dentro de uma camada cada anel tem a sua linha,
  // na ordem do `draw` e, entre pais, na ordem da árvore: assim as pistas horizontais dos fios nunca se encostam e os
  // filhos de um mesmo pai ficam em linhas seguidas.
  const bands: number[][] = [];
  const walk = (id: number, depth: number): void => {
    for (const k of children.get(id) ?? []) {
      const band = bands[depth] ?? [];
      bands[depth] = band;
      band.push(k);
      walk(k, depth + 1);
    }
  };
  for (const r of roots) walk(r, 0);
  const closed = new Map<number, Pos>();
  let maxY = HOOK_Y + HOOK_RY;
  let rowY = HOOK_Y + HOOK_RY + FIRST;
  for (const band of bands) {
    for (const [i, k] of band.entries()) {
      const y = rowY + ROW * i;
      closed.set(k, { x: laneX(laneOf.get(k) as number), y });
      maxY = Math.max(maxY, y + CLOSED_RY + 14);
    }
    rowY += ROW * (band.length - 1) + LEVEL;
  }

  // A coluna de cada base alarga para caber o leque dos seus fios: o espaço entre duas bases é múltiplo de 80 (assim os
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
    const gap = 80 * Math.ceil(((fan(b - 1) + fan(b)) / 2 + PITCH) / 80);
    baseCenters.push((baseCenters[b - 1] as number) + gap);
  }
  const baseX = (b: number): number => baseCenters[b] as number;

  // largura múltipla de 80: as casas da agulha, ancoradas na ponta, ficam sempre a 40 px das faixas
  const width =
    Math.ceil(
      Math.max(
        320,
        (baseCenters[nb - 1] as number) + BASE_X0,
        BASE_X0 + Math.max(0, nextLane - 1) * LANE_W + 80,
        40 + (peak - 1) * SLOT + 140,
      ) / 80,
    ) * 80;

  // Tudo é calculado no desenho da mão esquerda (ponta da agulha à direita) e espelhado na saída (x -> largura - x) na
  // mão direita. As alças da agulha ficam ancoradas na ponta: a mais nova está na ponta e as mais antigas deslizam
  // 80 px em direção ao cabo a cada alça nova (e de volta quando um `draw` as remove).
  const mirrored = (opts.hand ?? "right") === "right";
  const X = (x: number): number => (mirrored ? width - x : x);
  const onHook = new Map<number, Pos>();
  for (const [i, l] of state.loops.entries()) {
    onHook.set(l.id, { x: width - 40 - (state.loops.length - 1 - i) * SLOT, y: HOOK_Y });
  }
  const centerOf = (id: number): Pos => (onHook.get(id) ?? closed.get(id)) as Pos;
  const isHook = (id: number): boolean => onHook.has(id);
  const ids = [...info.keys()].filter((id) => onHook.has(id) || closed.has(id)).sort((a, b) => a - b);
  const kindOf = (id: number): B.LoopKind => (info.get(id) as Info).kind;
  const baseOf = (id: number): number | undefined =>
    kindOf(id) === "pulled" ? (info.get(id) as Info).base : undefined;

  // Caminhos dos fios. Cada alça na agulha tem um (dois braços que passam por cima da agulha); cada anel fechado tem um se
  // ele atravessa outros anéis ou se veio de uma base. O caminho sai da alça (da agulha, ou do fundo do anel), passa pelo
  // furo de cada anel que a alça atravessou, na ordem do `draw`, e então (se veio de uma base) segue até a base; senão,
  // termina aberto logo abaixo do último anel (ou da agulha).
  const paths: Path[] = [];
  for (const id of ids) {
    const kids = children.get(id) ?? [];
    const hook = isHook(id);
    const c = centerOf(id);
    const bx = c.x + BOWL_DX;
    const start: Pos = hook ? { x: c.x, y: BEND_Y } : { x: bx, y: c.y };
    const pts: Pos[] = [start];
    const tags: (number | null)[] = [];
    const through: (number | null)[] = [];
    let cur = start;
    let pending: number | null = null;
    const push = (p: Pos, tag: number | null): void => {
      if (Math.hypot(p.x - cur.x, p.y - cur.y) < 0.01) return;
      pts.push(p);
      tags.push(tag);
      through.push(pending);
      pending = null;
      cur = p;
    };
    // os braços do U fechado: as duas linhas da própria alça saem pelas pontas, no sentido da ponta da agulha
    if (!hook) push({ x: bx + ARM, y: c.y }, null);
    for (const [i, k] of kids.entries()) {
      const kc = closed.get(k) as Pos;
      const lvl = levelOf.get(k) as number;
      const prev = i === 0 ? lvl : (levelOf.get(kids[i - 1] as number) as number);
      push({ x: cur.x, y: kc.y - ENTER }, prev);
      push({ x: kc.x + BOWL_DX + HALF, y: kc.y - ENTER }, lvl);
      pending = k;
    }
    const lastKid = kids[kids.length - 1];
    if (lastKid !== undefined) {
      push({ x: cur.x, y: (closed.get(lastKid) as Pos).y + 14 }, levelOf.get(lastKid) as number);
    } else if (hook && baseOf(id) === undefined) {
      push({ x: cur.x, y: HOOK_Y + HOOK_RY }, null);
    }
    const base = baseOf(id);
    paths.push({
      id,
      pts,
      tags,
      through,
      legFrom: pts.length - 1,
      ...(base === undefined ? {} : { base }),
      drop: cur.x,
      land: cur.x,
      track: -1,
    });
  }

  // Pernas: a alça puxada de uma base segue, a GAP entre as duas linhas, por uma pista própria abaixo de todos os anéis até
  // a sua casa do V; a curva fica por baixo do V. Só há trechos retos (horizontais e verticais), então o deslocamento
  // ±GAP/2 da linha central mantém a distância entre as linhas constante e nada se sobrepõe.
  const legs = paths.filter((p) => p.base !== undefined);
  const byBase = new Map<number, Path[]>();
  for (const p of legs) byBase.set(p.base as number, [...(byBase.get(p.base as number) ?? []), p]);
  const vHalf = new Map<number, number>();
  for (const [b, list] of byBase) {
    list.sort((p, q) => p.drop - q.drop || p.id - q.id);
    vHalf.set(b, Math.max(14, ((list.length - 1) * PITCH) / 2 + HALF + STRAND_W + 4));
    for (const [i, p] of list.entries()) p.land = baseX(b) + (i - (list.length - 1) / 2) * PITCH;
  }
  // Ordem das pistas, de cima para baixo. Regra: quanto mais longe da base a alça cai, mais baixa a pista (sem cruzar dentro
  // da mesma base). Restrição: se a casa de entrada de B fica a menos de PITCH da descida de A, a pista de B é mais baixa
  // que a de A, senão o trecho vertical de B (que começa na sua pista) se sobreporia ao de A (que termina na pista dele).
  const dist = (p: Path): number => Math.abs(p.land - p.drop);
  const todo = legs.filter((p) => dist(p) > 0.5).sort((p, q) => dist(p) - dist(q) || p.id - q.id);
  const tracked: Path[] = [];
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
  for (const p of legs) {
    if (p.track < 0) p.land = p.drop;
    if (p.track >= 0) {
      const ty = railY + 12 + p.track * PITCH;
      p.pts.push({ x: p.drop, y: ty }, { x: p.land, y: ty });
      p.tags.push(null, null);
      p.through.push(null, null);
    }
    p.pts.push({ x: p.land, y: curveY });
    p.tags.push(null);
    p.through.push(null);
  }

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

  const backs: string[] = [];
  const fronts: string[] = [];
  const middle: string[] = [];

  // fios: as duas linhas de cada caminho; nas alças da agulha, o primeiro trecho (e a dobra) cruzam a agulha
  const sweep = mirrored ? 0 : 1;
  for (const p of paths) {
    const hook = isHook(p.id);
    const color = COLOR[kindOf(p.id)];
    const c = centerOf(p.id);
    const bx = c.x + BOWL_DX;
    // no U fechado os braços são horizontais: a linha de cima é a de trás, a de baixo a da frente
    const sides = hook
      ? ([
          ["back", HALF],
          ["front", -HALF],
        ] as const)
      : ([
          ["back", -HALF],
          ["front", HALF],
        ] as const);
    for (const [side, d] of sides) {
      const line = offset(p.pts, d);
      for (let k = 0; k + 1 < line.length; k++) {
        const [a, b] = [line[k] as Pos, line[k + 1] as Pos];
        const tag = p.tags[k] ?? null;
        const thr = p.through[k] ?? null;
        let attrs = `data-pair="${p.id}" data-side="${side}" data-seg="${k}"`;
        if (p.base !== undefined && k >= p.legFrom) attrs += ` data-leg="${p.id}" data-base="${p.base}"`;
        if (tag !== null) attrs += ` data-strand="${p.id}" data-draw="${tag}"`;
        if (thr !== null) attrs += ` data-through="${thr}"`;
        const arm = k === 0;
        if (arm && hook) {
          attrs += ` data-loop="${p.id}" data-kind="${kindOf(p.id)}" data-on-hook="1" data-part="${side}" data-cx="${f(X(c.x))}" data-cy="${HOOK_Y}"`;
        } else if (arm) {
          // data-cx/data-cy: o centro do círculo do U; data-hx/data-hw: o interior por onde passa o fio que o atravessa
          attrs += ` data-loop="${p.id}" data-kind="${kindOf(p.id)}" data-on-hook="0" data-part="${side}" data-cx="${f(X(bx))}" data-cy="${f(c.y)}" data-hx="${f(X(bx + (ARM - HALF) / 2))}" data-hw="${f((ARM + HALF) / 2)}"`;
        }
        const coords = `x1="${f(X(a.x))}" y1="${f(a.y)}" x2="${f(X(b.x))}" y2="${f(b.y)}"`;
        const el = `<line ${attrs} ${coords} stroke="${color}" stroke-width="${STRAND_W}" stroke-linecap="round"/>`;
        if (!arm) {
          middle.push(el);
          continue;
        }
        // o braço atrás da agulha (ou do fio que atravessa o U) vai antes; o da frente vai depois, com halo na cor do fundo
        const sw = mirrored ? 1 : 0;
        const bend = hook
          ? side === "back"
            ? `M ${f(X(c.x - HALF))} ${BEND_Y} A ${HALF} ${HALF} 0 0 ${sweep} ${f(X(c.x))} ${BEND_Y - HALF}`
            : `M ${f(X(c.x))} ${BEND_Y - HALF} A ${HALF} ${HALF} 0 0 ${sweep} ${f(X(c.x + HALF))} ${BEND_Y}`
          : side === "back"
            ? `M ${f(X(bx))} ${f(c.y - HALF)} A ${HALF} ${HALF} 0 0 ${sw} ${f(X(bx - HALF))} ${f(c.y)}`
            : `M ${f(X(bx - HALF))} ${f(c.y)} A ${HALF} ${HALF} 0 0 ${sw} ${f(X(bx))} ${f(c.y + HALF)}`;
        const arc = `<path data-bend="${p.id}" data-side="${side}" d="${bend}" fill="none" stroke="${color}" stroke-width="${STRAND_W}" stroke-linecap="round"/>`;
        if (side === "back") backs.push(arc, el);
        else {
          const halo = (g: string): string =>
            `<${g} stroke="${BG}" stroke-width="${STRAND_W + 5}" stroke-linecap="butt" fill="none"/>`;
          fronts.push(halo(`path d="${bend}"`), arc, halo(`line ${coords}`), el);
        }
      }
    }
  }
  for (const p of legs) {
    middle.push(
      `<path data-leg-curve="${p.id}" data-base="${p.base}" d="M ${f(X(p.land - HALF))} ${f(curveY)} A ${HALF} ${HALF} 0 0 ${mirrored ? 1 : 0} ${f(X(p.land + HALF))} ${f(curveY)}" fill="none" stroke="${COLOR.pulled}" stroke-width="${STRAND_W}" stroke-linecap="round"/>`,
    );
  }

  // 1) costas, 2) agulha, 3) fios, 4) bases (por cima das curvas: a alça passa por baixo do V), 5) frentes
  out.push(...backs);
  // agulha: corpo, cabo (grosso, na ponta oposta aos laços) e a pontinha do gancho, no lado da ponta
  out.push(
    `<line data-hook="1" x1="${f(X(16))}" y1="${HOOK_Y}" x2="${f(X(width - 16))}" y2="${HOOK_Y}" stroke="#374151" stroke-width="7" stroke-linecap="round"/>`,
    `<line data-hook-handle="1" x1="${f(X(10))}" y1="${HOOK_Y}" x2="${f(X(80))}" y2="${HOOK_Y}" stroke="#6b7280" stroke-width="15" stroke-linecap="round"/>`,
    `<path data-hook-tip="1" d="M ${f(X(width - 18))} ${HOOK_Y} L ${f(X(width - 6))} ${HOOK_Y} L ${f(X(width - 12))} ${HOOK_Y + 9}" fill="none" stroke="#374151" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
  out.push(...middle);
  for (let b = 0; b < nb; b++) {
    const x = X(baseX(b));
    const hw = vHalf.get(b) ?? 14;
    out.push(
      `<path data-base-top="${b}" data-cx="${f(x)}" data-hw="${f(hw)}" d="M ${f(x - hw)} ${f(baseY - 14)} L ${f(x)} ${f(baseY)} L ${f(x + hw)} ${f(baseY - 14)}" fill="none" stroke="${BASE_COLOR}" stroke-width="${STRAND_W}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  out.push(...fronts);
  out.push("</svg>");
  return out.join("\n");
}
