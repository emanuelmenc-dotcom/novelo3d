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
const HOOK_RX = 6;
const HOOK_RY = 20;
const CLOSED_RX = 15;
const CLOSED_RY = 6;
/** Distância vertical do fundo de um laço ao primeiro laço que o fio dele atravessa. */
const LEVEL = 26;
/** Degrau vertical entre laços sucessivos do mesmo fio. */
const ROW = 14;
const BASE_X0 = 60;
const BASE_DX = 60;
/** Largura de uma faixa (folha da árvore); no mínimo 2 × CLOSED_RX mais folga. */
const LANE_W = 60;
const STRAND_W = 5;

export interface StitchDiagramOptions {
  /** Quantas bases (topos da carreira de baixo) desenhar. Padrão: o maior entre 5 e (maior base usada + 2). */
  bases?: number;
  /** Texto no canto superior esquerdo. */
  caption?: string;
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

/** Anel em volta da agulha (elipse em pé): costas = metade esquerda, frente = metade direita. */
const hookArc = (c: Pos, front: boolean): string =>
  `M ${f(c.x)} ${f(c.y - HOOK_RY)} A ${HOOK_RX} ${HOOK_RY} 0 0 ${front ? 1 : 0} ${f(c.x)} ${f(c.y + HOOK_RY)}`;

/** Laço fechado (elipse deitada, o fio passa na vertical): costas = metade de cima, frente = metade de baixo. */
const closedArc = (c: Pos, front: boolean): string =>
  `M ${f(c.x - CLOSED_RX)} ${f(c.y)} A ${CLOSED_RX} ${CLOSED_RY} 0 0 ${front ? 0 : 1} ${f(c.x + CLOSED_RX)} ${f(c.y)}`;

export function stitchDiagramSvg(state: B.BuilderState, opts: StitchDiagramOptions = {}): string {
  const { info, draws, peak } = history(state);
  const bases = B.basesOf(state.cmds);
  const maxBase = bases.length ? Math.max(...bases) : -1;
  const nb = Math.max(opts.bases ?? 5, maxBase + 2);
  const baseX = (b: number): number => BASE_X0 + b * BASE_DX;

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

  const onHook = new Map<number, Pos>();
  for (const [i, l] of state.loops.entries()) onHook.set(l.id, { x: 30 + i * SLOT, y: HOOK_Y });
  const centerOf = (id: number): Pos => (onHook.get(id) ?? closed.get(id)) as Pos;
  const isHook = (id: number): boolean => onHook.has(id);
  const ids = [...info.keys()].filter((id) => onHook.has(id) || closed.has(id)).sort((a, b) => a - b);

  const railY = maxY + 24;
  const baseY = railY + 36;
  const width = Math.max(
    320,
    2 * BASE_X0 + (nb - 1) * BASE_DX,
    BASE_X0 + Math.max(0, nextLane - 1) * LANE_W + 60,
    30 + (peak - 1) * SLOT + 60,
  );
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

  // bases (topos da carreira de baixo)
  for (let b = 0; b < nb; b++) {
    const x = baseX(b);
    out.push(
      `<path data-base-top="${b}" d="M ${f(x - 14)} ${f(baseY - 14)} L ${f(x)} ${f(baseY)} L ${f(x + 14)} ${f(baseY - 14)}" fill="none" stroke="${BASE_COLOR}" stroke-width="${STRAND_W}" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<text x="${f(x)}" y="${f(baseY + 24)}" font-size="11" text-anchor="middle" fill="#6b7280">base ${b}</text>`,
    );
  }

  // pernas das alças puxadas de uma base (descem da alça até o V)
  for (const id of ids) {
    const inf = info.get(id) as Info;
    if (inf.kind !== "pulled" || inf.base === undefined) continue;
    const c = centerOf(id);
    const yb = c.y + (isHook(id) ? HOOK_RY : CLOSED_RY);
    for (const [side, dx] of [
      ["l", -4],
      ["r", 4],
    ] as const) {
      // desce na vertical (numa faixa sem anel embaixo) e, abaixo de todos os anéis, vai em diagonal até o V da base
      const leg = (a: Pos, b: Pos, seg: string): string =>
        `<line data-leg="${id}" data-base="${inf.base}" data-side="${side}" data-seg="${seg}" x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${COLOR.pulled}" stroke-width="${STRAND_W}" stroke-linecap="round"/>`;
      out.push(
        leg({ x: c.x + dx, y: yb }, { x: c.x + dx, y: railY }, "v"),
        leg({ x: c.x + dx, y: railY }, { x: baseX(inf.base as number) + dx, y: baseY - 8 }, "d"),
      );
    }
  }

  const ring = (id: number, front: boolean): string => {
    const inf = info.get(id) as Info;
    const c = centerOf(id);
    const hook = isHook(id);
    const d = hook ? hookArc(c, front) : closedArc(c, front);
    const attrs = `data-loop="${id}" data-kind="${inf.kind}" data-on-hook="${hook ? 1 : 0}" data-part="${front ? "front" : "back"}"`;
    const draw = `<path ${attrs} d="${d}" fill="none" stroke="${COLOR[inf.kind]}" stroke-width="${STRAND_W}" stroke-linecap="round"/>`;
    // a frente leva um halo na cor do fundo: corta o que passa por trás dela
    return front
      ? `<path d="${d}" fill="none" stroke="${BG}" stroke-width="${STRAND_W + 5}" stroke-linecap="butt"/>${draw}`
      : draw;
  };

  // 1) costas dos anéis, 2) agulha, 3) fios, 4) frentes dos anéis: o fio passa entre as costas e a frente
  for (const id of ids) out.push(ring(id, false));
  out.push(
    `<line data-hook="1" x1="16" y1="${HOOK_Y}" x2="${f(width - 16)}" y2="${HOOK_Y}" stroke="#374151" stroke-width="7" stroke-linecap="round"/>`,
  );
  // o fio de cada laço sai do fundo dele, passa pelo centro de cada anel na ordem de `through` e sai pela frente do último
  const resume = new Map<number, Pos>();
  for (const d of draws) {
    const top = centerOf(d.top);
    let from = resume.get(d.top) ?? { x: top.x, y: top.y + (isHook(d.top) ? HOOK_RY : CLOSED_RY) };
    const color = COLOR[(info.get(d.top) as Info).kind];
    const seg = (a: Pos, b: Pos, extra: string): string =>
      `<line data-strand="${d.top}" data-draw="${d.level}" ${extra} x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${color}" stroke-width="${STRAND_W}" stroke-linecap="round"/>`;
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
