// SPDX-License-Identifier: GPL-3.0-or-later
// Gráfico circular de símbolos (docs/10 seção 2.4), A4, uma ou mais páginas. Port parcial de chart.py:
// sem linhas de ligação (modo não estrito), sem cartão de fio, sem adaptações (entram nos marcos seguintes).
import {
  applyPaint,
  buildGraph,
  DEFAULT_YARNS,
  expandRounds,
  type Issue,
  type PaintRegion,
  type Pattern,
  type StitchNode,
  type Yarn,
} from "@novelo/core";
import { drawRunBands, findRuns, type PendingTag, placeTags } from "./bands.ts";
import {
  arrow,
  COLOR,
  drawLabel,
  endMark,
  frame,
  type P,
  plainRing,
  Svg,
  startMark,
  symAm,
  symCh,
  symInc,
  symMpa,
  symPb,
  symPbx,
  symTall,
  symTog,
  yarnCard,
} from "./draw.ts";
import { type Item, layoutRing, WIDTH } from "./layout.ts";
import {
  chainsOfItems,
  drawTable,
  type MarkKey,
  markStrip,
  NOTE_RUN,
  type TableRow,
  tableHeight,
} from "./table.ts";

export interface ChartOptions {
  /** Versão para iniciantes: cores alternadas, total por volta e rótulos coloridos. */
  beginner?: boolean;
  title?: string;
  /** Máximo de anéis por página (anel liso conta meio). */
  maxRings?: number;
  /** Pintura de fios (regiões por voltas ou pontos). Com mais de um fio, o gráfico mostra halos e cartões. */
  paint?: PaintRegion[];
  /** Paleta de fios; padrão A verde musgo, B off white. */
  yarns?: Yarn[];
}

export interface ChartPage {
  svg: string;
  label: string;
  rings: number;
  /** Pares de símbolos que se sobrepõem (deve ser 0). */
  overlaps: number;
  /** Chaves de símbolos usados (sem os de referência). */
  symbols: string[];
  /** Fios usados nas voltas desenhadas na página (sem as de referência). */
  yarns: string[];
}

export interface ChartResult {
  pages: ChartPage[];
  issues: Issue[];
}

interface Entry {
  first: number;
  last: number;
  count: number;
  plain: boolean;
  items: Item[];
  /** Fio da volta lisa (única cor), quando plain. */
  yarn?: string;
  /** A volta termina com o ponto baixíssimo que fecha (não é um ponto: o grafo não o guarda). */
  closing?: boolean;
}

const C: P = [105, 128];
const MIN_R = 9;
const PITCH = 6.4;
const PLAIN_PITCH = 3.2;
const need = (items: Item[]): number => {
  const w = items.reduce((s, it) => s + (WIDTH[it.typ] ?? 4.7), 0) + 12.5;
  return w / (2 * Math.PI * 0.9);
};

function typOf(n: StitchNode, heads: Set<number>): string | null {
  switch (n.code) {
    case "RING":
      return null;
    case "SC":
      if (n.groupWith !== undefined || heads.has(n.id)) return "aum";
      if (n.parents.length >= 4) return "d4";
      if (n.parents.length === 3) return "d3";
      if (n.parents.length === 2) return "dim";
      return "pb";
    case "HDC":
      return "mpa";
    case "DC":
      return "dc";
    case "TR":
      return "tr";
    case "CH":
      return n.counted ? "ch" : "ch0";
    default:
      return "pbx";
  }
}

function buildEntries(pattern: Pattern, issues: Issue[], paint: PaintRegion[]): Entry[] {
  const g0 = buildGraph(pattern);
  const rounds = expandRounds(pattern);
  const g = paint.length > 0 ? applyPaint(g0, paint) : g0;
  const itemOf = new Map<number, Item>();
  const entries: Entry[] = [];
  const mk = (typ: string, counted: boolean, parents: Item[]): Item => ({
    typ,
    parents,
    counted,
    a: 0,
    r: 0,
  });
  let prevCountedItems: Item[] = [];
  let prevCount = 0;
  g.rows.forEach((row, i) => {
    const nodes = g.nodes.slice(row.first, row.last + 1);
    const heads = new Set(nodes.filter((n) => n.groupWith !== undefined).map((n) => n.groupWith as number));
    const counted = nodes.filter((n) => n.counted);
    const yarnSet = new Set(nodes.filter((n) => n.rowIndex >= 0).map((n) => n.yarnId));
    const roundYarn = yarnSet.size === 1 ? ([...yarnSet][0] as string) : null;
    const plain =
      roundYarn !== null &&
      i > 0 &&
      counted.length === nodes.length &&
      counted.length === prevCount &&
      nodes.every(
        (n) => n.code === "SC" && n.parents.length === 1 && n.groupWith === undefined && !heads.has(n.id),
      );
    // o pbx que fecha a volta (`join`) não é um ponto do grafo: vem das operações da receita
    const closing = rounds[i]?.atoms.some((a) => a.kind === "join") ?? false;
    const last = entries[entries.length - 1];
    if (
      plain &&
      last?.plain &&
      last.count === counted.length &&
      last.yarn === roundYarn &&
      (last.closing ?? false) === closing
    ) {
      last.last = i + 1;
      nodes.forEach((n, k) => {
        itemOf.set(n.id, last.items[k] as Item);
      });
      return;
    }
    if (plain) {
      const items = counted.map((_, k) => ({
        ...mk("pb", true, [prevCountedItems[k] as Item]),
        yarn: roundYarn as string,
      }));
      counted.forEach((n, k) => {
        itemOf.set(n.id, items[k] as Item);
      });
      entries.push({
        first: i + 1,
        last: i + 1,
        count: counted.length,
        plain: true,
        items,
        yarn: roundYarn as string,
        closing,
      });
      prevCountedItems = items;
      prevCount = counted.length;
      return;
    }
    const items: Item[] = [];
    for (const n of nodes) {
      const typ = typOf(n, heads);
      if (typ === null) continue;
      if (!["pb", "aum", "dim", "d3", "d4", "mpa", "dc", "tr", "ch", "ch0", "pbx"].includes(typ)) {
        issues.push({
          code: "CHART_SYMBOL_FALLBACK",
          severity: "warning",
          message: `Símbolo '${typ}' ainda não existe no gráfico.`,
        });
      }
      const parents = n.parents.map((p) => itemOf.get(p)).filter((x): x is Item => x !== undefined);
      const it = {
        ...mk(typ, n.counted, parents),
        yarn: n.yarnId,
        grp: n.groupWith ?? (heads.has(n.id) ? n.id : undefined),
      };
      items.push(it);
      itemOf.set(n.id, it);
    }
    entries.push({
      first: i + 1,
      last: i + 1,
      count: counted.length,
      plain: false,
      items,
      closing,
    });
    prevCountedItems = items.filter((it) => it.counted);
    prevCount = counted.length;
  });
  return entries;
}

interface PageSpec {
  /** Entrada de referência (volta anterior, em cinza), se houver. */
  ref: Entry | null;
  rows: Entry[];
  inward: boolean;
}

function splitPages(entries: Entry[], maxRings: number): PageSpec[] {
  // segmentos de mesma direção (crescendo ou fechando)
  const segs: Entry[][] = [];
  let dir = 0;
  let cur: Entry[] = [];
  entries.forEach((e, i) => {
    const prev = entries[i - 1];
    const d = prev === undefined || e.count === prev.count ? 0 : e.count > prev.count ? 1 : -1;
    if (d !== 0 && dir !== 0 && d !== dir) {
      segs.push(cur);
      cur = [];
    }
    if (d !== 0) dir = d;
    cur.push(e);
  });
  if (cur.length > 0) segs.push(cur);

  const pages: PageSpec[] = [];
  let prevEntry: Entry | null = null;
  for (const seg of segs) {
    const segDir = seg.length > 1 && (seg[seg.length - 1] as Entry).count < (seg[0] as Entry).count ? -1 : 1;
    const inward = prevEntry !== null && segDir === -1;
    let page: Entry[] = [];
    let used = 0;
    const flush = () => {
      if (page.length === 0) return;
      pages.push({ ref: pages.length === 0 ? null : prevEntry, rows: page, inward });
      prevEntry = page[page.length - 1] as Entry;
      page = [];
      used = 0;
    };
    for (const e of seg) {
      const cost = e.plain ? 0.5 : 1;
      if (used + cost > maxRings && page.length > 0) flush();
      page.push(e);
      used += cost;
    }
    flush();
  }
  return pages;
}

interface Pt {
  x: number;
  y: number;
  rad: number;
}

function drawRing(
  s: Svg,
  r: number,
  items: Item[],
  col: string,
  g: number,
  pts: Pt[] | null,
  halo?: (it: Item) => string | undefined,
): Set<string> {
  const used = new Set<string>();
  s.circle(C, r, 'fill="none" stroke="#cfcfcf" stroke-width="0.22"');
  const add = (p: P, rad: number) => pts?.push({ x: p[0], y: p[1], rad });
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as Item;
    const { o, u, t } = frame(C, r, it.a);
    used.add(it.typ);
    const hc = halo?.(it);
    if (hc) s.circle(o, 2.7, `fill="${hc}" fill-opacity="0.6" stroke="#8a8a8a" stroke-width="0.25"`);
    switch (it.typ) {
      case "pb":
        symPb(s, o, u, t, col);
        add(o, 2.4);
        break;
      case "mpa":
        symMpa(s, o, u, t, col);
        add(o, 2.8);
        break;
      case "dc":
        symTall(s, o, u, t, col, 1);
        add(o, 2.8);
        break;
      case "tr":
        symTall(s, o, u, t, col, 2);
        add(o, 2.8);
        break;
      case "ch":
      case "ch0":
        symCh(s, o, t, col);
        add(o, 2.6);
        break;
      case "pbx":
        symPbx(s, o, col);
        add(o, 1.2);
        break;
      case "aum": {
        const group = [it];
        while (
          i + 1 < items.length &&
          (items[i + 1] as Item).typ === "aum" &&
          (items[i + 1] as Item).parents[0] === it.parents[0] &&
          group.length < 3
        ) {
          i++;
          group.push(items[i] as Item);
        }
        const am = group.reduce((sum, x) => sum + x.a, 0) / group.length;
        const base = frame(C, r - g * 2.4, am).o;
        const tips = group.map((x) => frame(C, r + g * 2.2, x.a).o);
        symInc(s, base, tips, col);
        for (const tp of tips) add(tp, 2);
        break;
      }
      case "dim":
      case "d3":
      case "d4": {
        const apex = frame(C, r + g * 2.3, it.a).o;
        const offs =
          it.typ === "dim" ? [-2.1, 2.1] : it.typ === "d3" ? [-3.2, 0, 3.2] : [-4.2, -1.4, 1.4, 4.2];
        const bases = offs.map((d) => frame(C, r - g * 2.3, it.a + d / r).o);
        symTog(s, apex, bases, col);
        add(apex, 2.6);
        break;
      }
      default:
        symPb(s, o, u, t, col);
        add(o, 2.4);
    }
  }
  return used;
}

const pt = (p: P): { x: number; y: number } => ({ x: p[0], y: p[1] });

/** Etiquetas Nx (retângulo de w por 2,4 mm) que encostam em outra etiqueta ou num símbolo. */
function countTagOverlaps(tags: { m: P; w: number }[], others: Pt[]): number {
  let n = 0;
  tags.forEach((a, i) => {
    for (const b of tags.slice(i + 1))
      if (Math.abs(a.m[0] - b.m[0]) < (a.w + b.w) / 2 && Math.abs(a.m[1] - b.m[1]) < 2.4) n++;
    for (const o of others) {
      const dx = Math.max(0, Math.abs(a.m[0] - o.x) - a.w / 2);
      const dy = Math.max(0, Math.abs(a.m[1] - o.y) - 1.2);
      if (Math.hypot(dx, dy) < o.rad * 0.6) n++;
    }
  });
  return n;
}

function countOverlaps(pts: Pt[]): number {
  let n = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i] as Pt;
      const b = pts[j] as Pt;
      if (Math.hypot(a.x - b.x, a.y - b.y) < (a.rad + b.rad) * 0.8) n++;
    }
  }
  return n;
}

const range = (e: Entry): string => (e.first === e.last ? String(e.first) : `${e.first}–${e.last}`);

export function renderChart(pattern: Pattern, options: ChartOptions = {}): ChartResult {
  const issues: Issue[] = [];
  const beginner = options.beginner ?? true;
  const yarns = options.yarns ?? DEFAULT_YARNS;
  const colorOf = (id: string | undefined): string | undefined => yarns.find((y) => y.id === id)?.colorHex;
  const entries = buildEntries(pattern, issues, options.paint ?? []);
  // com mais de um fio (ou só um fio diferente do A) o gráfico mostra a cor de cada ponto
  const distinct = new Set(entries.flatMap((e) => e.items.map((it) => it.yarn ?? "A")));
  const showYarns = distinct.size > 1 || (distinct.size === 1 && !distinct.has("A"));
  const specs = splitPages(entries, options.maxRings ?? 9);
  const pages: ChartPage[] = [];
  const startsWithRing = pattern.rows[0]?.start === "magicRing";

  let pageNo = 0;
  specs.forEach((spec, pi) => {
    const myNo = ++pageNo;
    const s = new Svg();
    const g = spec.inward ? -1 : 1;
    const rowsAll: Entry[] = spec.ref ? [spec.ref, ...spec.rows] : spec.rows;

    // raios
    const radii: number[] = [];
    if (!spec.inward) {
      rowsAll.forEach((e, i) => {
        const prev = radii[i - 1];
        const pitch = e.plain ? PLAIN_PITCH : PITCH;
        radii.push(
          prev === undefined ? Math.max(MIN_R, need(e.items)) : Math.max(need(e.items), prev + pitch),
        );
      });
    } else {
      const k = rowsAll.length - 1;
      const r0 = Math.max(need((rowsAll[0] as Entry).items), MIN_R + k * PITCH);
      const pitch = k > 0 ? Math.min(PITCH, (r0 - MIN_R) / k) : PITCH;
      rowsAll.forEach((_, i) => {
        radii.push(r0 - i * pitch);
      });
    }
    const hasPlainPage = rowsAll.some((e, i) => !(spec.ref && i === 0) && e.plain);
    // tabela "Receita volta a volta": uma linha por entrada desta página, com as cores dos anéis
    const tableRows: TableRow[] = spec.rows.map((e) => {
      const ci = rowsAll.indexOf(e);
      const col = e.plain ? COLOR.grey : beginner ? (COLOR.alt[ci % 2] as string) : COLOR.black;
      const firstAm = pi === 0 && startsWithRing && e.first === 1;
      return {
        label: range(e),
        color: col,
        chains: chainsOfItems(e.items, firstAm, e.closing),
        total: e.count,
        plain: e.plain,
      };
    });
    const hasRuns = rowsAll.some(
      (e, i) => !(spec.ref && i === 0) && !e.plain && findRuns(e.items).length > 0,
    );
    const marks: MarkKey[] = ["ini", "fim"];
    if (spec.ref) marks.push("ref");
    if (hasPlainPage) marks.push("liso");
    if (hasRuns) marks.push("run");
    const notes: string[] = [];
    if (spec.inward)
      notes.push(
        "Este gráfico vai de fora para dentro: o anel cinza externo é a volta anterior (referência).",
      );
    else if (pi > 0) notes.push("O anel cinza interno é a volta anterior (referência).");
    if (pi < specs.length - 1) notes.push("Continua na página seguinte.");
    if (hasPlainPage)
      notes.push("Anéis tracejados: voltas só de ponto baixo, uma em cada ponto da volta anterior.");
    if (showYarns)
      notes.push(
        "Os círculos coloridos atrás dos símbolos marcam os pontos que não são do fio A; veja os cartões no alto da página.",
      );
    if (hasRuns) notes.push(NOTE_RUN);
    const rMax = Math.max(...radii);
    const notesH = notes.length > 0 ? 4.5 * notes.length + 3 : 0;
    const tableH = tableHeight(tableRows);
    const needH = tableH + 10 + notesH + 8;

    // ampliação uniforme para aproveitar a folha (raio útil de 88 mm incluindo a seta de sentido)
    const kFull = Math.min(1.8, 88 / (rMax + 12));
    // o diagrama sobe e encolhe para a tabela caber na mesma página; abaixo de 85% a tabela vai para a página seguinte
    const kFit = (287 - needH - 14 - 22) / (2 * (rMax + 12));
    const together = kFit >= 0.85;
    const k = together ? Math.min(kFull, kFit) : kFull;
    // sobra de altura entre o título e a tabela: o diagrama desce metade dela, para não colar no título
    const free = together ? 287 - needH - 14 - 22 - 2 * k * (rMax + 12) : 0;
    const dy = together ? 22 + k * (rMax + 12) - C[1] + Math.min(25, Math.max(0, free) / 2) : 0;
    if (k < 0.85)
      issues.push({
        code: "CHART_TOO_LARGE",
        severity: "warning",
        message: `Página ${pi + 1}: o gráfico é grande e foi reduzido (${Math.round(k * 100)}%).`,
      });
    s.add(
      `<g transform="translate(0 ${dy.toFixed(2)}) translate(${C[0]} ${C[1]}) scale(${k.toFixed(3)}) translate(${-C[0]} ${-C[1]})">`,
    );

    // layout e desenho
    const pts: Pt[] = [];
    const used = new Set<string>();
    const pageYarns = new Set<string>();
    const plainAngle: number[] = [];
    const tags: PendingTag[] = [];
    // o que as etiquetas Nx não podem cobrir além dos símbolos: etiquetas de volta e marcas de início e fim
    const extra: Pt[] = [];
    let plainCount = 0;
    let hasPlain = false;
    let lastLab = 0;
    rowsAll.forEach((e, i) => {
      const r = radii[i] as number;
      const isRef = spec.ref !== null && i === 0;
      const first = i === 0;
      const num = range(e);
      const cnt = beginner && !e.plain ? String(e.count) : "";
      const labW = e.plain
        ? 0.01
        : Math.max(4.5, 1.75 * num.length + 2.6) + (cnt === "" ? 0 : 1.3 * (cnt.length + 2) + 1.2);
      const lab = layoutRing(e.items, r, labW, first);
      lastLab = lab;
      const col = beginner ? (COLOR.alt[i % 2] as string) : COLOR.black;
      if (isRef) {
        for (const it of e.items) {
          const { o, u, t } = frame(C, r, it.a);
          symPb(s, o, u, t, COLOR.grey, 0.85);
        }
        s.circle(C, r, 'fill="none" stroke="#e2e2e2" stroke-width="0.22"');
        used.add("ref");
        return;
      }
      if (e.plain) {
        hasPlain = true;
        // anéis lisos vizinhos alternam de lado para as etiquetas não se sobreporem
        const pa = Math.PI / 2 + (plainCount++ % 2) * 0.9;
        plainAngle[i] = pa;
        // a volta lisa também é uma sequência de pb: ganha a faixa (o anel inteiro) e a etiqueta "Nx" (pergunta 9)
        s.circle(
          C,
          r,
          `fill="none" stroke="${col}" stroke-opacity="0.17" stroke-width="5.0" stroke-linecap="round"`,
        );
        plainRing(s, C, r, pa, `${num} · ${e.count} pb`, showYarns ? colorOf(e.yarn) : undefined);
        extra.push({ ...pt(frame(C, r, pa).o), rad: 9 });
        tags.push({ r, a: pa + Math.PI, txt: `${e.count}x`, col });
        if (e.yarn) pageYarns.add(e.yarn);
        return;
      }
      // só os pontos que não são do fio A ganham halo: o fio base fica limpo e os outros se destacam
      const halo = showYarns
        ? (it: Item) => (it.yarn && it.yarn !== "A" ? colorOf(it.yarn) : undefined)
        : undefined;
      tags.push(...drawRunBands(s, C, r, e.items, col));
      for (const t of drawRing(s, r, e.items, col, g, pts, halo)) used.add(t);
      for (const it of e.items) if (it.yarn) pageYarns.add(it.yarn);
      drawLabel(s, C, r, lab, num, cnt, col);
      extra.push({ ...pt(frame(C, r, lab).o), rad: labW / 2 + 1 });
    });

    // centro, início, fim, sentido
    if (pi === 0 && startsWithRing) {
      symAm(s, C, COLOR.black);
      used.add("am");
    }
    const firstDrawn = rowsAll.findIndex((e, i) => !(spec.ref && i === 0) && !e.plain && e.items.length > 0);
    if (firstDrawn >= 0) {
      const e = rowsAll[firstDrawn] as Entry;
      const it0 = e.items[0] as Item;
      const { o, u } = frame(C, radii[firstDrawn] as number, it0.a);
      void o;
      const p = frame(C, (radii[firstDrawn] as number) - g * 4.2, it0.a).o;
      startMark(s, p, [g * u[0], g * u[1]]);
      extra.push({ ...pt(p), rad: 3 });
      used.add("ini");
    }
    const lastIdx = rowsAll.length - 1;
    const le = rowsAll[lastIdx] as Entry;
    const lr = radii[lastIdx] as number;
    if (le.plain) {
      const ep = frame(C, lr, (plainAngle[lastIdx] ?? Math.PI / 2) - ((1.28 * 12) / 2 + 3.2 + 2) / lr).o;
      endMark(s, ep);
      extra.push({ ...pt(ep), rad: 3 });
    } else {
      // volta sem pontos (receita incompleta): sem marca de fim
      const itn = le.items[le.items.length - 1];
      if (itn) {
        const ep = frame(C, lr + g * 4.2, itn.a).o;
        endMark(s, ep);
        extra.push({ ...pt(ep), rad: 3 });
      }
    }
    used.add("fim");
    if (hasPlain) used.add("liso");
    void lastLab;
    // etiquetas "Nx": depois de tudo, no lado com mais folga em relação a símbolos, etiquetas de volta e marcas
    const placed = placeTags(
      s,
      C,
      tags,
      [...pts, ...extra].map((p): P => [p.x, p.y]),
    );
    const tagOverlaps = countTagOverlaps(
      placed.map((m, i) => ({ m, w: 1.45 * (tags[i]?.txt.length ?? 0) + 1.4 })),
      [...pts, ...extra],
    );
    arrow(s, C, rMax + 8, 0.15 * Math.PI, 0.55 * Math.PI, COLOR.start);
    const ap = frame(C, rMax + 11, 0.4 * Math.PI).o;
    s.text(ap[0] + 2, ap[1], "sentido do trabalho", 2.6, COLOR.start);
    s.add("</g>");

    // textos
    const lastRound = (spec.rows[spec.rows.length - 1] as Entry).last;
    const firstRound = (spec.rows[0] as Entry).first;
    const label = `voltas ${firstRound}–${lastRound}`;
    s.text(12, 13, options.title ?? "Gráfico circular", 5, COLOR.black, "start", true);
    s.text(12, 18.5, `${label} · página ${myNo} de @@TOTAL@@ · leitura anti-horária`, 3, "#555555");
    // cartões de fio, alinhados à direita, abaixo do título
    const cardYarns = showYarns ? yarns.filter((y) => pageYarns.has(y.id)) : [];
    [...cardYarns].reverse().forEach((y, i) => {
      yarnCard(s, 198 - 47 - i * 50, 15, y.id, y.name, y.colorHex);
    });

    const order = [
      "am",
      "pb",
      "aum",
      "dim",
      "d3",
      "d4",
      "mpa",
      "dc",
      "tr",
      "ch",
      "ch0",
      "pbx",
      "ref",
      "liso",
      "ini",
      "fim",
    ];
    const keys = order.filter((k) => used.has(k));
    // ordem vertical: diagrama, tabela, faixa de marcas, notas; a tabela vai para outra página se não couber
    const y0 = C[1] + dy + k * (rMax + 12) + 14;
    let y = y0;
    if (together) y = drawTable(s, 12, y, tableRows) + 4;
    y = markStrip(s, 12, y + 2, marks, beginner ? undefined : COLOR.black) + 6;
    if (notes.length > 0) {
      s.text(12, y, "Notas", 3.2, COLOR.black, "start", true);
      for (const n of notes) {
        y += 4.5;
        s.text(12, y, n, 2.7);
      }
    }
    s.text(
      198,
      293.5,
      "Gerado pelo Novelo3D. Símbolos: padrão Craft Yarn Council, redesenhados.",
      2.2,
      "#777777",
      "end",
    );

    pages.push({
      svg: s.toString(),
      label,
      rings: rowsAll.length,
      overlaps: countOverlaps(pts) + tagOverlaps,
      symbols: keys,
      yarns: cardYarns.map((y) => y.id),
    });
    if (!together) {
      // página de continuação: o mesmo título com " (receita)" e só a tabela
      const t = new Svg();
      t.text(12, 13, `${options.title ?? "Gráfico circular"} (receita)`, 5, COLOR.black, "start", true);
      t.text(12, 18.5, `${label} · página ${++pageNo} de @@TOTAL@@`, 3, "#555555");
      drawTable(t, 12, 28, tableRows);
      t.text(198, 293.5, "Gerado pelo Novelo3D.", 2.2, "#777777", "end");
      pages.push({
        svg: t.toString(),
        label: `${label} (receita)`,
        rings: 0,
        overlaps: 0,
        symbols: [],
        yarns: [],
      });
    }
  });
  for (const p of pages) p.svg = p.svg.replaceAll("@@TOTAL@@", String(pageNo));
  return { pages, issues };
}
