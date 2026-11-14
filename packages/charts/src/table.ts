// SPDX-License-Identifier: GPL-3.0-or-later
// Tabela "Receita volta a volta" e faixa de marcas do gráfico v3 (docs/17 seções 4 e 5). Port de referencia/graficos-python/v3.py
// (`units`, `rle`, `compress`, `tsym`, `_row`, `recipe_table`, `mark_strip`), com a medição separada do desenho. A regra de
// agrupamento `(bloco) ×k` é a `chainsOf` do core, a mesma do modo de leitura. Aguarda aprovação visual do usuário (regra 7).
import { type ChainRules, type Chains, chainsOf } from "@novelo/core";
import {
  COLOR,
  endMark,
  type P,
  pill,
  type Svg,
  startMark,
  symCh,
  symInc,
  symPb,
  symPbx,
  symTog,
} from "./draw.ts";
import type { Item } from "./layout.ts";

/** Abreviações da tabela (docs/17 seção 4.3). */
export const ABBR: Record<string, string> = {
  pb: "pb",
  aum: "aum",
  dim: "dim",
  d3: "pb3jun",
  d4: "pb4jun",
  mpa: "mpa",
  dc: "pa",
  tr: "pad",
  ch0: "corr*",
  ch: "corr",
  pbx: "pbx",
  pbxj: "pbx",
  am: "am",
};

/** Início da linha: anel mágico e corrente que não conta; fim: pbx que fecha a volta. */
const RULES: ChainRules = {
  isStart: (k) => k === "am" || k === "ch0",
  isEnd: (k) => k === "pbx" || k === "pbxj",
};

/** Uma linha da tabela, já em dados: a etiqueta da volta, as cadeias e o total. */
export interface TableRow {
  label: string;
  color: string;
  chains: Chains;
  total: number;
  /** Texto curto depois da sequência (itálico cinza). */
  extra?: string;
  /** Volta só de pb (anel tracejado): um traço tracejado antes da sequência. */
  plain?: boolean;
}

/** Itens da volta em chaves de tabela: o aumento (dois pb no mesmo ponto) conta uma vez. */
export function unitsOf(items: Item[], firstAm = false, closing = false): string[] {
  const out: string[] = firstAm ? ["am"] : [];
  const seen = new Set<number>();
  for (const it of items) {
    if (it.typ === "aum" && it.grp !== undefined) {
      if (seen.has(it.grp)) continue;
      seen.add(it.grp);
    }
    out.push(it.typ);
  }
  // o pbx que fecha a volta (`join`) nunca se soma aos outros pbx: chave própria, sempre no fim
  if (closing) out.push("pbxj");
  return out;
}

export function chainsOfItems(items: Item[], firstAm = false, closing = false): Chains {
  return chainsOf(unitsOf(items, firstAm, closing), RULES);
}

// ---------------------------------------------------------------- medição e desenho de uma linha

const RH = 5.6;
const LH = 4.7;
const TABLE_HEAD = 7.5;

/** Largura do símbolo da tabela (mm). */
const symWidth = (key: string): number => (key === "d4" ? 9 : key === "am" ? 5.6 : 5.2);
const abbr = (key: string): string => ABBR[key] ?? key;

/** Símbolo pequeno da tabela, centrado em (cx, cy). */
function tsym(s: Svg, key: string, cx: number, cy: number, col: string): void {
  const U: P = [0, -1];
  const T: P = [1, 0];
  switch (key) {
    case "pb":
      symPb(s, [cx, cy], U, T, col, 0.85);
      break;
    case "aum":
      symInc(
        s,
        [cx, cy + 2],
        [
          [cx - 2, cy - 1.9],
          [cx + 2, cy - 1.9],
        ],
        col,
      );
      break;
    case "dim":
      symTog(
        s,
        [cx, cy - 1.9],
        [
          [cx - 1.9, cy + 1.9],
          [cx + 1.9, cy + 1.9],
        ],
        col,
      );
      break;
    case "d3":
      symTog(
        s,
        [cx, cy - 1.9],
        [-2.4, 0, 2.4].map((d): P => [cx + d, cy + 1.9]),
        col,
      );
      break;
    case "d4":
      symTog(
        s,
        [cx, cy - 1.9],
        [-3.6, -1.2, 1.2, 3.6].map((d): P => [cx + d, cy + 1.9]),
        col,
      );
      break;
    case "ch":
    case "ch0":
      symCh(s, [cx, cy], T, col);
      break;
    case "pbx":
    case "pbxj":
      symPbx(s, [cx, cy], col);
      break;
    case "mpa":
    case "dc":
    case "tr":
      s.line([cx, cy - 2.1], [cx, cy + 2.1], col);
      s.line([cx - 1.5, cy - 2.1], [cx + 1.5, cy - 2.1], col);
      // pa: um traço sobre a haste; pad: dois
      for (let i = 0; i < (key === "dc" ? 1 : key === "tr" ? 2 : 0); i++)
        s.line([cx - 1, cy - 0.4 + i * 1.2], [cx + 1, cy + 0.4 + i * 1.2], col, 0.35);
      break;
    case "am":
      s.circle([cx, cy], 2.2, `fill="none" stroke="${col}" stroke-width="0.45"`);
      break;
    default:
      symPb(s, [cx, cy], U, T, col, 0.85);
  }
}

/** Desenha (ou só mede, com `s === null`) uma linha da tabela a partir de (x0, y); devolve a altura. */
function layoutRow(s: Svg | null, x0: number, y: number, row: TableRow, W: number): number {
  const maxX = x0 + W - 20;
  let x = x0 + 17;
  let cy = y + RH / 2;
  let lines = 1;
  const wrap = (w: number) => {
    if (x + w > maxX) {
      x = x0 + 17;
      cy += LH;
      lines++;
    }
  };
  if (row.plain) {
    s?.add(
      `<line x1="${x}" y1="${cy}" x2="${x + 7}" y2="${cy}" stroke="${COLOR.link}" stroke-width="0.3" stroke-dasharray="1.2 0.9"/>`,
    );
    x += 9;
  }
  const emit = (key: string, n: number, last: boolean) => {
    if (key === "am") {
      wrap(12);
      if (s) {
        tsym(s, "am", x + 2.4, cy, row.color);
        s.text(x + 5.6, cy + 0.95, "am:", 2.7, COLOR.black, "start", true);
      }
      x += 12;
      return;
    }
    const ab = abbr(key);
    const nx = `${n}x`;
    wrap(1.8 * nx.length + 1.3 + symWidth(key) + 0.4 + 1.6 * ab.length + (last ? 1.2 : 3));
    s?.text(x, cy + 0.95, nx, 2.7, COLOR.black, "start", true);
    x += 1.8 * nx.length + 1.3;
    if (s) tsym(s, key, x + (key === "d4" ? 4 : 2.3), cy, row.color);
    x += symWidth(key) + 0.4;
    s?.text(x, cy + 0.95, ab + (last ? "" : ";"), 2.7);
    x += 1.6 * ab.length + (last ? 1.2 : 3);
  };
  const { head, body, times, tail } = row.chains;
  for (const r of head) emit(r.key, r.count, false);
  if (times > 1) {
    wrap(1.6);
    s?.text(x, cy + 1, "(", 3.4);
    x += 1.6;
  }
  body.forEach((r, i) => {
    emit(r.key, r.count, i === body.length - 1 && !(tail.length > 0 && times === 1));
  });
  if (times > 1) {
    wrap(9);
    s?.text(x, cy + 1, `) ×${times}${tail.length > 0 ? ";" : ""}`, 3, COLOR.black, "start", true);
    x += tail.length > 0 ? 11 : 9;
  }
  tail.forEach((r, i) => {
    emit(r.key, r.count, i === tail.length - 1);
  });
  if (row.extra) {
    wrap(1.4 * row.extra.length + 2);
    s?.text(x + 1.5, cy + 0.95, row.extra, 2.4, "#555555", "start", false, true);
  }
  const h = RH + LH * (lines - 1);
  if (s) {
    const my = y + RH / 2;
    pill(s, [x0 + 7, my], row.label, row.color, row.label.length < 5 ? 2.6 : 2.2);
    s.text(x0 + W - 9, my + 0.95, `(${row.total})`, 2.7, row.color, "middle", true);
    s.add(
      `<line x1="${x0}" y1="${y + h}" x2="${x0 + W}" y2="${y + h}" stroke="#d6d6d6" stroke-width="0.2"/>`,
    );
  }
  return h;
}

/** Altura da tabela (mm), medida sem desenhar. */
export function tableHeight(rows: TableRow[], W = 186): number {
  return TABLE_HEAD + rows.reduce((sum, r) => sum + layoutRow(null, 12, 0, r, W), 0);
}

/** Desenha a tabela com o título e o cabeçalho; devolve o y logo abaixo dela. */
export function drawTable(
  s: Svg,
  x0: number,
  y0: number,
  rows: TableRow[],
  title = "Receita volta a volta",
  W = 186,
): number {
  s.text(x0, y0, title, 3.4, COLOR.black, "start", true);
  if (W > 120)
    s.text(
      x0 + 4 + 2.05 * title.length,
      y0,
      "símbolo + abreviação, na ordem em que os pontos são feitos",
      2.5,
      "#555555",
    );
  let y = y0 + 2.5;
  s.add(`<rect x="${x0}" y="${y}" width="${W}" height="5" fill="#eeeeee"/>`);
  for (const [cx, h] of [
    [x0 + 1.5, "Volta"],
    [x0 + 17, "Sequência de pontos"],
    [x0 + W - 14, "Total"],
  ] as [number, string][])
    s.text(cx, y + 3.5, h, 2.7, COLOR.black, "start", true);
  y += 5;
  for (const r of rows) y += layoutRow(s, x0, y, r, W);
  return y;
}

// ---------------------------------------------------------------- faixa de marcas (o que não é ponto)

export const NOTE_RUN =
  "Etiqueta = número e início da volta; (n) = total. Faixa clara = pb seguidos (5 ou mais); o número fica no 1º ponto.";

export type MarkKey = "ini" | "fim" | "lig" | "liso" | "run" | "ref";

const MARK_TEXT: Record<MarkKey, string> = {
  ini: "primeiro ponto",
  fim: "último ponto",
  lig: "ligação ao ponto de baixo",
  liso: "volta só de pb",
  run: "pb seguidos",
  ref: "ponto de outra volta (referência)",
};

/** Etiqueta "Nx" (retângulo arredondado branco com o contorno na cor da volta). */
export function countTag(s: Svg, m: P, txt: string, col: string): void {
  const w = 1.45 * txt.length + 1.4;
  s.add(
    `<rect x="${(m[0] - w / 2).toFixed(2)}" y="${(m[1] - 1.2).toFixed(2)}" width="${w.toFixed(2)}" height="2.4" rx="1.2" fill="white" stroke="${col}" stroke-width="0.25"/>`,
  );
  s.text(m[0], m[1] + 0.78, txt, 2.1, col, "middle", true);
}

/** Uma linha (ou duas, se passar de xMax) com o que não é ponto; devolve o y da última linha. */
export function markStrip(
  s: Svg,
  x0: number,
  y0: number,
  keys: MarkKey[],
  runColor: string = COLOR.alt[0] as string,
  xMax = 175,
): number {
  let x = x0 + 2;
  let y = y0;
  keys.forEach((k, i) => {
    let dx = 3.5;
    if (k === "ini") {
      startMark(s, [x + 0.4, y], [1, 0]);
      dx = 4;
    } else if (k === "fim") {
      endMark(s, [x, y]);
    } else if (k === "lig") {
      s.line([x - 2, y + 1.6], [x + 2, y - 1.6], COLOR.link, 0.3);
    } else if (k === "liso") {
      s.add(
        `<line x1="${x - 3}" y1="${y}" x2="${x + 3}" y2="${y}" stroke="${COLOR.link}" stroke-width="0.3" stroke-dasharray="1.2 0.9"/>`,
      );
      dx = 4.5;
    } else if (k === "ref") {
      symPb(s, [x, y], [0, -1], [1, 0], COLOR.grey, 0.8);
    } else {
      x += 3;
      s.add(
        `<line x1="${x - 3}" y1="${y}" x2="${x + 3}" y2="${y}" stroke="${runColor}" stroke-opacity="0.17" stroke-width="4.4" stroke-linecap="round"/>`,
      );
      countTag(s, [x + 7.6, y], "15x", runColor);
      x += 10.6;
      dx = 1.8;
    }
    s.text(x + dx, y + 0.9, MARK_TEXT[k], 2.5);
    x += dx + 1.5 * MARK_TEXT[k].length + 6;
    if (x > xMax && i < keys.length - 1) {
      x = x0 + 2;
      y += 6;
    }
  });
  return y;
}
