// SPDX-License-Identifier: GPL-3.0-or-later
// Motor direto (P5a, docs/08 seção 1): perfil de revolução -> voltas -> contagens -> receita (Pattern) validada.
// Puro e determinístico: mesma entrada, mesma receita.
import { type Issue, type Op, type Pattern, type Result, type Row, roundCount, validate } from "@novelo/core";

/** Ponto do perfil: raio e altura, em mm. O perfil começa no polo (raio 0), onde fica o anel mágico. */
export type ProfilePoint = [r: number, z: number];

export type Shape =
  | { kind: "sphere"; radius: number }
  | { kind: "ellipsoid"; radius: number; halfHeight: number }
  | { kind: "cone"; halfAngleDeg: number; slant: number }
  | { kind: "cup"; radius: number; wall: number }
  | { kind: "profile"; points: ProfilePoint[] }
  | { kind: "stack"; segments: Segment[] };

/**
 * Trecho de uma peça composta (P5b), encadeado a partir do polo: vai do raio atual até `radius` subindo `height` mm.
 * `line` faz cone ou cilindro (raio igual); `round` faz um quarto de elipse bojudo (calota, ombro, fecho arredondado).
 * O último trecho com `radius` 0 fecha a peça.
 */
export interface Segment {
  radius: number;
  height: number;
  curve: "line" | "round";
}

const ROUND_STEPS = 400;

/** Polilinha do perfil de uma peça composta. */
export function stackProfile(segments: Segment[]): ProfilePoint[] {
  const pts: ProfilePoint[] = [[0, 0]];
  for (const g of segments) {
    const [r0, z0] = pts[pts.length - 1] as ProfilePoint;
    if (g.curve === "line") {
      pts.push([g.radius, z0 + g.height]);
      continue;
    }
    // bojudo nos dois sentidos: abrindo, cresce rápido no começo; fechando, cai rápido no fim
    for (let i = 1; i <= ROUND_STEPS; i++) {
      const t = (Math.PI / 2) * (i / ROUND_STEPS);
      pts.push(
        g.radius >= r0
          ? [r0 + (g.radius - r0) * Math.sin(t), z0 + g.height * (1 - Math.cos(t))]
          : [g.radius + (r0 - g.radius) * Math.cos(t), z0 + g.height * Math.sin(t)],
      );
    }
  }
  return pts;
}

export interface Gauge {
  /** Largura do ponto (mm). */
  w: number;
  /** Altura da volta (mm). */
  h: number;
}

export interface ForwardOptions {
  startCount?: number;
  startMin: number;
  startMax: number;
  closeAt: number;
  maxIncreasePerStitch: 2 | 3;
  stagger: "none" | "alternate";
  friendlyMultiple: number;
  friendlyTolerance: number;
  rowPhase: number;
}

export const DEFAULTS: ForwardOptions = {
  startMin: 4,
  startMax: 12,
  closeAt: 6,
  maxIncreasePerStitch: 2,
  stagger: "alternate",
  friendlyMultiple: 0,
  friendlyTolerance: 1,
  rowPhase: 1,
};

/** Saliência (P5c): a volta engorda `amount` (fração do raio) em volta do ângulo `angleDeg`, entre `from` e `to` mm do perfil. */
export interface Bump {
  angleDeg: number;
  widthDeg: number;
  amount: number;
  from: number;
  to: number;
}

/**
 * Seção não circular (P5c, docs/08 seção 2). `ratio`: largura em y sobre largura em x (1 = redonda, 0,5 = achatada pela
 * metade). `bumps`: saliências. Com seção, a contagem vem do comprimento do laço e os aumentos e diminuições do
 * acoplamento entre as voltas, então se concentram onde a volta cresce.
 */
export interface Section {
  ratio?: number;
  bumps?: Bump[];
}

export interface ForwardInput {
  shape: Shape;
  gauge: Gauge;
  options?: Partial<ForwardOptions>;
  section?: Section;
}

type XY = [number, number];
const LOOP = 2048;

/** O laço da volta de raio `r` no comprimento de arco `s`: pontos em volta do eixo, começando na costura (ângulo 0). */
function loopOf(r: number, s: number, sec: Section): XY[] {
  const ratio = sec.ratio ?? 1;
  const bumps = (sec.bumps ?? []).filter((b) => s >= b.from && s <= b.to);
  return Array.from({ length: LOOP }, (_, i) => {
    const t = (2 * Math.PI * i) / LOOP;
    let f = 1;
    for (const b of bumps) {
      const a0 = (b.angleDeg * Math.PI) / 180;
      const half = Math.max(1e-6, (b.widthDeg * Math.PI) / 360);
      const d = Math.atan2(Math.sin(t - a0), Math.cos(t - a0));
      if (Math.abs(d) < half) f += b.amount * Math.cos((Math.PI / 2) * (d / half)) ** 2;
    }
    return [r * f * Math.cos(t), r * f * ratio * Math.sin(t)];
  });
}

const perimeter = (loop: XY[]): number =>
  loop.reduce((a, p, i) => {
    const q = loop[(i + 1) % loop.length] as XY;
    return a + Math.hypot(q[0] - p[0], q[1] - p[1]);
  }, 0);

/** `n` pontos espaçados igualmente em comprimento ao longo do laço, a partir da costura. */
function spread(loop: XY[], n: number): XY[] {
  const L = perimeter(loop);
  const out: XY[] = [];
  let acc = 0;
  let k = 0;
  for (let i = 0; i < loop.length && k < n; i++) {
    const p = loop[i] as XY;
    const q = loop[(i + 1) % loop.length] as XY;
    const seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
    while (k < n && (k * L) / n <= acc + seg + 1e-12) {
      const t = seg > 0 ? ((k * L) / n - acc) / seg : 0;
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      k++;
    }
    acc += seg;
  }
  while (out.length < n) out.push(loop[0] as XY);
  return out;
}

/**
 * Acoplamento da volta nova à anterior (docs/08 seção 2.4): caminho monótono de custo mínimo, por programação dinâmica,
 * com o primeiro par fixo na costura. Ponto baixo liga 1 pai a 1 filho; aumento, 1 pai a 2 (ou 3) filhos; diminuição,
 * 2 pais a 1 filho. O custo de cada ligação é o quadrado da diferença de ângulo em volta do eixo: numa volta redonda
 * isso espalha os aumentos por igual; onde a volta cresce (saliência), os pontos ficam mais juntos em ângulo e os
 * aumentos se concentram ali.
 */
export function couple(parents: XY[], children: XY[], maxIncrease: 2 | 3 = 2): Token[] {
  // ângulos a partir da costura (0 a 2π), na ordem dos pontos
  const ang = (v: XY[]) => v.map(([x, y]) => (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI));
  const pa = ang(parents);
  const ca = ang(children);
  return coupleBy(
    parents.length,
    children.length,
    (b, a) => ((ca[b] as number) - (pa[a] as number)) ** 2,
    maxIncrease,
  );
}

/** O mesmo acoplamento com um custo qualquer por ligação: `d(filho, pai)`. A malha livre usa a distância no espaço. */
export function coupleBy(
  m: number,
  n: number,
  d: (b: number, a: number) => number,
  maxIncrease: 2 | 3 = 2,
): Token[] {
  const W = n + 1;
  const cost = new Float64Array((m + 1) * W).fill(Number.POSITIVE_INFINITY);
  const move = new Int8Array((m + 1) * W).fill(-1);
  cost[0] = 0;
  // movimentos em ordem de preferência no empate: ponto baixo, aumento de 2, aumento de 3, diminuição
  const moves: { da: number; db: number; tok: Token }[] = [
    { da: 1, db: 1, tok: "SC" },
    { da: 1, db: 2, tok: "INC2" },
    ...(maxIncrease === 3 ? [{ da: 1, db: 3, tok: "INC3" as Token }] : []),
    { da: 2, db: 1, tok: "DEC" },
  ];
  for (let a = 0; a <= m; a++) {
    for (let b = 0; b <= n; b++) {
      const here = cost[a * W + b] as number;
      if (!Number.isFinite(here)) continue;
      moves.forEach((mv, k) => {
        const a2 = a + mv.da;
        const b2 = b + mv.db;
        if (a2 > m || b2 > n) return;
        let c = 0;
        for (let x = 0; x < mv.da; x++) for (let y = 0; y < mv.db; y++) c += d(b + y, a + x);
        const v = here + c;
        if (v < (cost[a2 * W + b2] as number) - 1e-9) {
          cost[a2 * W + b2] = v;
          move[a2 * W + b2] = k;
        }
      });
    }
  }
  const toks: Token[] = [];
  let a = m;
  let b = n;
  while (a > 0 || b > 0) {
    const k = move[a * W + b] as number;
    const mv = moves[k];
    if (!mv) throw new Error("acoplamento sem caminho"); // não acontece com n entre m/2 e o máximo por ponto
    toks.push(mv.tok);
    a -= mv.da;
    b -= mv.db;
  }
  return toks.reverse();
}

export interface ForwardRow {
  /** Comprimento de arco do polo até a volta (mm). */
  s: number;
  r: number;
  /** Altura da volta no perfil (mm). */
  z: number;
  ideal: number;
  n: number;
}

export interface ForwardOutput {
  counts: number[];
  rows: ForwardRow[];
  pattern: Pattern;
  /** Comprimento total do perfil (mm). */
  length: number;
  /** O perfil usado (polilinha do polo para fora, mm). */
  profile: ProfilePoint[];
}

const SAMPLES = 20_000;
const warn = (code: string, message: string, row?: number): Issue => ({
  code,
  message,
  severity: "warning",
  ...(row === undefined ? {} : { row }),
});
const fail = (code: string, message: string): Result<ForwardOutput> => ({
  ok: false,
  issues: [{ code, message, severity: "error" }],
});

/** Perfil em polilinha (do polo para fora) e se a peça fecha no fim (termina de novo no eixo). */
export function profileOf(shape: Shape): { points: ProfilePoint[]; closedEnd: boolean } {
  const arc = (r: (t: number) => number, z: (t: number) => number): ProfilePoint[] =>
    Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const t = (Math.PI * i) / SAMPLES;
      return [i === 0 || i === SAMPLES ? 0 : r(t), z(t)];
    });
  switch (shape.kind) {
    case "sphere":
      return {
        points: arc(
          (t) => shape.radius * Math.sin(t),
          (t) => -shape.radius * Math.cos(t),
        ),
        closedEnd: true,
      };
    case "ellipsoid":
      return {
        points: arc(
          (t) => shape.radius * Math.sin(t),
          (t) => -shape.halfHeight * Math.cos(t),
        ),
        closedEnd: true,
      };
    case "cone": {
      const a = (shape.halfAngleDeg * Math.PI) / 180;
      return {
        points: [
          [0, 0],
          [shape.slant * Math.sin(a), shape.slant * Math.cos(a)],
        ],
        closedEnd: false,
      };
    }
    case "cup":
      return {
        points: [
          [0, 0],
          [shape.radius, 0],
          [shape.radius, shape.wall],
        ],
        closedEnd: false,
      };
    case "profile": {
      const p = shape.points;
      return { points: p, closedEnd: p.length > 1 && p[p.length - 1]?.[0] === 0 };
    }
    case "stack": {
      const p = stackProfile(shape.segments);
      return { points: p, closedEnd: p.length > 1 && p[p.length - 1]?.[0] === 0 };
    }
  }
}

/** Uma operação por posição: SC (1 pai, 1 filho), INC2/INC3 (1 pai, 2 ou 3 filhos), DEC (2 pais, 1 filho). */
export type Token = "SC" | "INC2" | "INC3" | "DEC";

/** Posições especiais entre `m`, `q` delas, para a volta `round` (docs/08 seção 1.4). */
function specials(m: number, q: number, round: number, stagger: ForwardOptions["stagger"]): Set<number> {
  const out = new Set<number>();
  if (q <= 0) return out;
  const even = round % 2 === 0;
  if (m % q === 0) {
    const b = m / q;
    const f = stagger === "alternate" && even ? Math.floor(b / 2) : 0;
    for (let k = 0; k < q; k++) out.add(k * b + b - 1 - f);
    return out;
  }
  const phi = stagger === "alternate" ? (even ? 0.75 : 0.25) : 0.5;
  for (let k = 0; k < q; k++) out.add(Math.floor(((k + phi) * m) / q));
  return out;
}

/** Como fazer `c` pontos sobre `p` pais na volta `round`. */
export function distribute(
  p: number,
  c: number,
  round: number,
  stagger: ForwardOptions["stagger"] = "alternate",
): Token[] {
  const d = c - p;
  if (d === 0) return Array<Token>(p).fill("SC");
  if (d > 0 && d <= p) {
    const s = specials(p, d, round, stagger);
    return Array.from({ length: p }, (_, i) => (s.has(i) ? "INC2" : "SC"));
  }
  if (d > p) {
    // mais que dobrar (só com até 3 por ponto): todos aumentam, alguns de 3
    const s = specials(p, d - p, round, stagger);
    return Array.from({ length: p }, (_, i) => (s.has(i) ? "INC3" : "INC2"));
  }
  const s = specials(c, -d, round, stagger);
  return Array.from({ length: c }, (_, i) => (s.has(i) ? "DEC" : "SC"));
}

/** Operações da receita a partir dos tokens de uma volta (junta os iguais seguidos). */
export function opsOf(tokens: Token[]): Op[] {
  const ops: Op[] = [];
  for (const t of tokens) {
    const last = ops[ops.length - 1];
    const op: Op =
      t === "SC"
        ? { kind: "stitch", code: "SC", count: 1 }
        : t === "DEC"
          ? { kind: "dec", k: 2, count: 1 }
          : { kind: "inc", k: t === "INC3" ? 3 : 2, count: 1 };
    // junta pontos iguais seguidos (o impressor também dobra as repetições)
    if (
      last &&
      last.kind === op.kind &&
      typeof last.count === "number" &&
      (last.kind !== "inc" || (op.kind === "inc" && last.k === op.k)) &&
      (last.kind !== "dec" || (op.kind === "dec" && last.k === op.k))
    ) {
      last.count += 1;
    } else ops.push(op);
  }
  return ops;
}

/** Comprimentos de arco acumulados do perfil. */
function cumulative(points: ProfilePoint[]): number[] {
  const acc = [0];
  for (let i = 1; i < points.length; i++) {
    const [r0, z0] = points[i - 1] as ProfilePoint;
    const [r1, z1] = points[i] as ProfilePoint;
    acc.push((acc[i - 1] as number) + Math.hypot(r1 - r0, z1 - z0));
  }
  return acc;
}

/** Raio e altura no comprimento de arco `s` (interpolação linear). */
function pointAt(points: ProfilePoint[], acc: number[], s: number): ProfilePoint {
  let lo = 0;
  let hi = acc.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((acc[mid] as number) <= s) lo = mid;
    else hi = mid;
  }
  const a = acc[lo] as number;
  const b = acc[hi] as number;
  const t = Math.min(1, Math.max(0, b > a ? (s - a) / (b - a) : 0));
  const [r0, z0] = points[lo] as ProfilePoint;
  const [r1, z1] = points[hi] as ProfilePoint;
  return [r0 + (r1 - r0) * t, z0 + (z1 - z0) * t];
}

/** Reentrância (tigela): o perfil volta a descer depois de subir, longe do eixo. O enchimento empurraria a parede. */
function bowl(points: ProfilePoint[], w: number): boolean {
  let up = false;
  for (let i = 1; i < points.length; i++) {
    const [r0, z0] = points[i - 1] as ProfilePoint;
    const [, z1] = points[i] as ProfilePoint;
    if (z1 > z0 + 1e-9) up = true;
    else if (up && z1 < z0 - 1e-9 && r0 > w) return true;
  }
  return false;
}

function checkInput(input: ForwardInput): string | null {
  const { w, h } = input.gauge ?? ({} as Gauge);
  if (!(w > 0) || !(h > 0)) return "a largura e a altura do ponto devem ser maiores que zero";
  const s = input.shape;
  const pos = (...v: number[]) => v.every((x) => Number.isFinite(x) && x > 0);
  switch (s?.kind) {
    case "sphere":
      return pos(s.radius) ? null : "o raio deve ser maior que zero";
    case "ellipsoid":
      return pos(s.radius, s.halfHeight) ? null : "o raio e a meia altura devem ser maiores que zero";
    case "cone":
      return pos(s.slant) && s.halfAngleDeg > 0 && s.halfAngleDeg <= 90
        ? null
        : "o cone precisa de geratriz maior que zero e ângulo entre 0 e 90 graus";
    case "cup":
      return pos(s.radius, s.wall) ? null : "o raio e a parede devem ser maiores que zero";
    case "profile": {
      const p = s.points;
      if (!Array.isArray(p) || p.length < 2) return "o perfil precisa de pelo menos dois pontos";
      if (p.some((q) => !Array.isArray(q) || !q.every(Number.isFinite) || (q[0] as number) < 0))
        return "cada ponto do perfil é [raio, altura], com raio de zero para cima";
      // shortcut: só peças que começam no eixo (anel mágico); começo em corrente aberta fica para quando for preciso
      if ((p[0] as ProfilePoint)[0] !== 0)
        return "o perfil deve começar no eixo (raio 0), onde fica o anel mágico";
      return null;
    }
    case "stack": {
      const g = s.segments;
      if (!Array.isArray(g) || g.length === 0) return "a peça composta precisa de pelo menos um trecho";
      if (
        g.some(
          (x) =>
            !x ||
            !Number.isFinite(x.radius) ||
            !Number.isFinite(x.height) ||
            x.radius < 0 ||
            x.height < 0 ||
            (x.curve !== "line" && x.curve !== "round"),
        )
      )
        return "cada trecho tem raio e altura (mm, de zero para cima) e curva line ou round";
      if (g.reduce((a, x) => a + x.height, 0) <= 0 && g.every((x) => x.radius === 0))
        return "a peça composta não tem tamanho";
      return null;
    }
    default:
      return "forma desconhecida: use sphere, ellipsoid, cone, cup, profile ou stack";
  }
}

function checkSection(sec: Section | undefined): string | null {
  if (sec === undefined) return null;
  if (typeof sec !== "object" || sec === null) return "a seção deve ser {ratio, bumps}";
  if (sec.ratio !== undefined && !(Number.isFinite(sec.ratio) && sec.ratio >= 0.1 && sec.ratio <= 10))
    return "a proporção da seção deve ficar entre 0,1 e 10";
  if (sec.bumps !== undefined) {
    if (!Array.isArray(sec.bumps)) return "as saliências devem ser uma lista";
    for (const b of sec.bumps) {
      const ok =
        b &&
        [b.angleDeg, b.widthDeg, b.amount, b.from, b.to].every(Number.isFinite) &&
        b.widthDeg > 0 &&
        b.widthDeg <= 360 &&
        b.amount > -0.9 &&
        b.amount <= 3 &&
        b.to >= b.from;
      if (!ok)
        return "cada saliência tem ângulo, largura (0 a 360 graus), quanto (-0,9 a 3) e trecho de/até em mm";
    }
  }
  return null;
}

/** Gera a receita de uma peça de revolução. */
export function revolve(input: ForwardInput): Result<ForwardOutput> {
  const bad = checkInput(input) ?? checkSection(input.section);
  if (bad) return fail("BAD_INPUT", bad);
  const o: ForwardOptions = { ...DEFAULTS, ...input.options };
  const { w, h } = input.gauge;
  const { points, closedEnd } = profileOf(input.shape);
  const acc = cumulative(points);
  const S = acc[acc.length - 1] as number;
  const issues: Issue[] = [];
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

  const sec = input.section;
  const loops: XY[][] = [];
  const rows: ForwardRow[] = [];
  for (let i = 1; ; i++) {
    const s = (i - 1 + o.rowPhase) * h;
    if (s > S + 1e-9) break;
    const [r, z] = pointAt(points, acc, s);
    let ideal = (2 * Math.PI * r) / w;
    if (sec) {
      // seção não circular: a contagem vem do comprimento do laço
      const loop = loopOf(r, s, sec);
      loops.push(loop);
      ideal = perimeter(loop) / w;
    }
    const prev = rows[rows.length - 1]?.n;
    let n: number;
    if (prev === undefined) {
      n = o.startCount ?? clamp(roundCount(ideal), o.startMin, o.startMax);
    } else {
      const lo = Math.ceil(prev / 2);
      const hi = o.maxIncreasePerStitch * prev;
      n = clamp(roundCount(ideal), lo, hi);
      if (n !== roundCount(ideal)) {
        const diff = n - ideal;
        issues.push(
          warn(
            "CLAMPED_ROW",
            `volta ${i}: ${n} pontos em vez de ${roundCount(ideal)} (a forma muda rápido demais; desvio de ${Math.abs(diff).toFixed(1)} pontos, ${Math.abs(diff * w).toFixed(1)} mm de circunferência)`,
            i - 1,
          ),
        );
      }
      const k = o.friendlyMultiple;
      if (k > 0) {
        const m = Math.round(ideal / k) * k;
        if (m !== n && m >= lo && m <= hi && m > 0 && Math.abs(m - ideal) <= o.friendlyTolerance + 1e-9) {
          issues.push(
            warn(
              "FRIENDLY_SNAP",
              `volta ${i}: ${m} pontos em vez de ${n}, para a receita repetir certinho`,
              i - 1,
            ),
          );
          n = m;
        }
      }
    }
    rows.push({ s, r, z, ideal, n });
  }

  // peça que fecha: termina na primeira volta, depois do maior total, com até `closeAt` pontos
  if (closedEnd && rows.length > 0) {
    let top = 0;
    rows.forEach((row, i) => {
      if (row.n > (rows[top] as ForwardRow).n) top = i;
    });
    const end = rows.findIndex((row, i) => i > top && row.n <= o.closeAt);
    if (end >= 0) rows.length = end + 1;
  }
  const own = issues.filter((x) => x.row === undefined || x.row < rows.length);

  if (rows.length === 0) return fail("TOO_SHORT", "a peça é mais curta que uma volta");
  if (rows.length < 3) own.push(warn("TOO_SHORT", `a peça tem só ${rows.length} volta(s)`));
  rows.forEach((row, i) => {
    if (i > 0 && i < rows.length - 1 && row.ideal < 4)
      own.push(
        warn("TOO_THIN", `volta ${i + 1}: trecho com menos de 4 pontos de volta; difícil de crochetar`, i),
      );
  });
  if (bowl(points, w))
    own.push(
      warn("NOT_STUFFABLE", "o perfil tem uma reentrância (tigela): o enchimento empurra a parede para fora"),
    );

  const out: Row[] = rows.map((row, i) => {
    const label = String(i + 1);
    if (i === 0)
      return {
        label,
        kind: "round",
        start: "magicRing",
        ops: [{ kind: "stitch", code: "SC", count: row.n }],
        declaredCount: row.n,
      };
    const prev = (rows[i - 1] as ForwardRow).n;
    const tokens = sec
      ? couple(spread(loops[i - 1] as XY[], prev), spread(loops[i] as XY[], row.n), o.maxIncreasePerStitch)
      : distribute(prev, row.n, i + 1, o.stagger);
    return { label, kind: "round", ops: opsOf(tokens), declaredCount: row.n };
  });
  const pattern: Pattern = { dialect: "pt-BR", rows: out };
  const v = validate(pattern);
  if (!v.ok) return { ok: false, issues: [...v.issues, ...own] }; // erro de programação: a receita gerada não fecha
  return {
    ok: true,
    value: { counts: rows.map((r) => r.n), rows, pattern, length: S, profile: points },
    issues: own,
  };
}
export { fromMesh, type Mesh, type MeshOutput, type MeshPiece, parseStl } from "./mesh.ts";
