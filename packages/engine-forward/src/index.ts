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

export interface ForwardInput {
  shape: Shape;
  gauge: Gauge;
  options?: Partial<ForwardOptions>;
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

function opsOf(tokens: Token[]): Op[] {
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

/** Gera a receita de uma peça de revolução. */
export function revolve(input: ForwardInput): Result<ForwardOutput> {
  const bad = checkInput(input);
  if (bad) return fail("BAD_INPUT", bad);
  const o: ForwardOptions = { ...DEFAULTS, ...input.options };
  const { w, h } = input.gauge;
  const { points, closedEnd } = profileOf(input.shape);
  const acc = cumulative(points);
  const S = acc[acc.length - 1] as number;
  const issues: Issue[] = [];
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

  const rows: ForwardRow[] = [];
  for (let i = 1; ; i++) {
    const s = (i - 1 + o.rowPhase) * h;
    if (s > S + 1e-9) break;
    const [r, z] = pointAt(points, acc, s);
    const ideal = (2 * Math.PI * r) / w;
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
    return {
      label,
      kind: "round",
      ops: opsOf(distribute(prev, row.n, i + 1, o.stagger)),
      declaredCount: row.n,
    };
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
