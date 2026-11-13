// SPDX-License-Identifier: GPL-3.0-or-later
// Relaxamento do fio de uma célula periódica (etapa H1b do criador de pontos): PBD (projeções por iteração, sem massa)
// numa cadeia de segmentos iguais que colide com as 9 cópias deslocadas de si mesma (cobrem o olho da base, os filhos,
// o ponto anterior e o seguinte). Fase 1 infla o raio de ρ₀ até o alvo; fase 2 aperta (encurta o fio) enquanto a
// penetração máxima ficar abaixo de 5% de ρ. Determinístico: sem acaso, ordem fixa (Gauss-Seidel). Puro.
import type { V3 } from "./models.ts";
import { resample, scCellPath } from "./yarn-cell.ts";

/** Pontos mais próximos de dois segmentos (Ericson): distância e parâmetros s (em p) e t (em q). */
export function segSegDist(p0: V3, p1: V3, q0: V3, q1: V3): { d: number; s: number; t: number } {
  const d1: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const d2: V3 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]];
  const r: V3 = [p0[0] - q0[0], p0[1] - q0[1], p0[2] - q0[2]];
  const a = d1[0] * d1[0] + d1[1] * d1[1] + d1[2] * d1[2];
  const e = d2[0] * d2[0] + d2[1] * d2[1] + d2[2] * d2[2];
  const f = d2[0] * r[0] + d2[1] * r[1] + d2[2] * r[2];
  let s: number;
  let t: number;
  const EPS = 1e-12;
  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = Math.max(0, Math.min(1, f / e));
  } else {
    const c = d1[0] * r[0] + d1[1] * r[1] + d1[2] * r[2];
    if (e <= EPS) {
      t = 0;
      s = Math.max(0, Math.min(1, -c / a));
    } else {
      const b = d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2];
      const den = a * e - b * b;
      s = den > EPS ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (b - c) / a));
      }
    }
  }
  const cx = p0[0] + d1[0] * s - (q0[0] + d2[0] * t);
  const cy = p0[1] + d1[1] * s - (q0[1] + d2[1] * t);
  const cz = p0[2] + d1[2] * s - (q0[2] + d2[2] * t);
  return { d: Math.hypot(cx, cy, cz), s, t };
}

export interface CellOptions {
  /** Raio alvo do fio (em larguras de ponto). */
  rho: number;
  /** Segmentos da cadeia (padrão 96). */
  m?: number;
  /** Raio inicial da inflação (padrão 0,03). */
  rho0?: number;
  /** Estágios de inflação (padrão 20) e iterações por estágio (padrão 25). */
  inflateStages?: number;
  inflateIters?: number;
  /** Comprimento final do fio em relação ao do traçado inicial (padrão 1; menos = ponto mais apertado). */
  lengthScale?: number;
  /** Iterações extras no raio alvo depois da inflação (padrão 300). */
  settleIters?: number;
  /** Estágios de aperto (padrão 10), fator de encurtamento por estágio (padrão 0,985) e iterações (padrão 40). */
  tightenStages?: number;
  tightenFactor?: number;
  tightenIters?: number;
  /** Raio mínimo de curvatura em múltiplos de ρ (padrão 1,5). */
  bendRadius?: number;
}

export interface CellResult {
  /** Nós da cadeia (m + 1), com o último = primeiro + (1, 0, 0). */
  pts: V3[];
  length: number;
  /** Menor distância entre segmentos não adjacentes (inclui as cópias). */
  minDist: number;
  /** Maior penetração (2ρ − distância), em fração de ρ; 0 se não há. */
  maxPenetration: number;
  stagesDone: number;
  /**
   * Menor distância entre segmentos não adjacentes vista em QUALQUER iteração (entre os pares ao alcance). Enquanto ela
   * fica longe de zero o fio nunca atravessou fio: a topologia do traçado inicial se preserva (isotopia).
   */
  minDistEver: number;
}

const SHIFTS: V3[] = [];
for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) SHIFTS.push([dx, dy, 0]);

/**
 * Pares de segmentos de uma cadeia periódica que podem colidir: segmento i da cópia central contra o segmento j da
 * cópia com deslocamento `s`; sem os adjacentes (mesma cópia a até 2 segmentos, e os vizinhos através da junção
 * periódica em x).
 */
function pairs(m: number): { i: number; j: number; s: V3 }[] {
  const out: { i: number; j: number; s: V3 }[] = [];
  for (const s of SHIFTS) {
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        if (s[0] === 0 && s[1] === 0) {
          if (j <= i) continue; // cada par uma vez
          if (Math.min(j - i, m - (j - i)) <= 2) continue;
        } else if (s[1] === 0) {
          // junção periódica: o fim da cadeia central toca o início da cópia seguinte (e vice-versa)
          const far = s[0] === 1 ? m - i + j : m - j + i;
          if (far <= 2) continue;
        }
        out.push({ i, j, s });
      }
    }
  }
  return out;
}

/** Menor distância entre segmentos não adjacentes de uma cadeia periódica de `m` segmentos (nós m + 1). */
export function cellMinDist(pts: V3[]): number {
  const m = pts.length - 1;
  let min = Number.POSITIVE_INFINITY;
  for (const { i, j, s } of pairs(m)) {
    const a0 = pts[i] as V3;
    const a1 = pts[i + 1] as V3;
    const b0 = pts[j] as V3;
    const b1 = pts[j + 1] as V3;
    const d = segSegDist(
      a0,
      a1,
      [b0[0] + s[0], b0[1] + s[1], b0[2] + s[2]],
      [b1[0] + s[0], b1[1] + s[1], b1[2] + s[2]],
    ).d;
    if (d < min) min = d;
  }
  return min;
}

/** Relaxa a cadeia com colisão (ver o cabeçalho). `path` são os pontos de controle do traçado inicial. */
export function relaxCell(path: V3[], opts: CellOptions): CellResult {
  const m = opts.m ?? 96;
  const rho = opts.rho;
  const rho0 = Math.min(opts.rho0 ?? 0.03, rho);
  const inflateStages = opts.inflateStages ?? 20;
  const inflateIters = opts.inflateIters ?? 25;
  const lengthScale = opts.lengthScale ?? 1;
  const settleIters = opts.settleIters ?? 300;
  const tightenStages = opts.tightenStages ?? 10;
  const tightenFactor = opts.tightenFactor ?? 0.985;
  const tightenIters = opts.tightenIters ?? 40;
  const bend = opts.bendRadius ?? 1.5;

  const init = resample(path, m, [1, 0, 0]);
  // variáveis: nós 0..m-1; o nó m é o nó 0 + (1, 0, 0); fora de [0, m] vale a periodicidade
  const P: V3[] = init.slice(0, m).map((p) => [p[0], p[1], p[2]] as V3);
  const node = (i: number): V3 => {
    const k = ((i % m) + m) % m;
    const sh = (i - k) / m;
    const p = P[k] as V3;
    return [p[0] + sh, p[1], p[2]];
  };
  let total = 0;
  for (let i = 0; i < m; i++) {
    const a = node(i);
    const b = node(i + 1);
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  let rest = total / m;
  const list = pairs(m);
  const disp: V3[] = Array.from({ length: m }, () => [0, 0, 0] as V3);
  const clearDisp = (): void => {
    for (const d of disp) {
      d[0] = 0;
      d[1] = 0;
      d[2] = 0;
    }
  };
  const add = (i: number, dx: number, dy: number, dz: number, w: number): void => {
    const d = disp[((i % m) + m) % m] as V3;
    d[0] += dx * w;
    d[1] += dy * w;
    d[2] += dz * w;
  };
  const move = (i: number, dx: number, dy: number, dz: number): void => {
    const p = P[((i % m) + m) % m] as V3;
    p[0] += dx;
    p[1] += dy;
    p[2] += dz;
  };

  let seen = Number.POSITIVE_INFINITY;
  /** Restrição de distância entre vizinhos (o fio não estica nem encolhe). */
  const keepLength = (restLen: number): void => {
    for (let i = 0; i < m; i++) {
      const a = node(i);
      const b = node(i + 1);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const len = Math.hypot(dx, dy, dz) || 1e-12;
      const k = (len - restLen) / len / 2;
      move(i, dx * k, dy * k, dz * k);
      move(i + 1, -dx * k, -dy * k, -dz * k);
    }
  };

  const iterate = (r: number, restLen: number): void => {
    keepLength(restLen);
    // 2) curvatura mínima: a corda i-1 → i+1 não pode ficar menor que a de um arco de raio bend·ρ (abre as pontas)
    const R = bend * r;
    const minChord = 2 * R * Math.sin(Math.min(Math.PI / 2, restLen / R));
    for (let i = 0; i < m; i++) {
      const a = node(i - 1);
      const b = node(i + 1);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const len = Math.hypot(dx, dy, dz) || 1e-12;
      if (len >= minChord) continue;
      const k = (minChord - len) / len / 2;
      move(i - 1, -dx * k, -dy * k, -dz * k);
      move(i + 1, dx * k, dy * k, dz * k);
    }
    // 3) colisão cápsula-cápsula a 2ρ (acumulada por iteração e limitada a ρ/2 por nó)
    clearDisp();
    const lim = 2 * r;
    const cc: V3[] = [];
    for (let i = 0; i < m; i++) {
      const a = node(i);
      const b = node(i + 1);
      cc.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    }
    const reach = restLen + lim;
    for (const { i, j, s } of list) {
      const ci = cc[i] as V3;
      const cj = cc[j] as V3;
      if (
        Math.abs(ci[0] - cj[0] - s[0]) > reach ||
        Math.abs(ci[1] - cj[1] - s[1]) > reach ||
        Math.abs(ci[2] - cj[2] - s[2]) > reach
      ) {
        continue;
      }
      const a0 = node(i);
      const a1 = node(i + 1);
      const b0 = node(j);
      const b1 = node(j + 1);
      const q0: V3 = [b0[0] + s[0], b0[1] + s[1], b0[2] + s[2]];
      const q1: V3 = [b1[0] + s[0], b1[1] + s[1], b1[2] + s[2]];
      const { d, s: u, t } = segSegDist(a0, a1, q0, q1);
      if (d < seen) seen = d;
      if (d >= lim || d < 1e-9) continue;
      const pa: V3 = [a0[0] + (a1[0] - a0[0]) * u, a0[1] + (a1[1] - a0[1]) * u, a0[2] + (a1[2] - a0[2]) * u];
      const pb: V3 = [q0[0] + (q1[0] - q0[0]) * t, q0[1] + (q1[1] - q0[1]) * t, q0[2] + (q1[2] - q0[2]) * t];
      const nx = (pa[0] - pb[0]) / d;
      const ny = (pa[1] - pb[1]) / d;
      const nz = (pa[2] - pb[2]) / d;
      const push = (lim - d) / 2;
      const na = (1 - u) ** 2 + u * u;
      const nb = (1 - t) ** 2 + t * t;
      add(i, nx * push, ny * push, nz * push, (1 - u) / na);
      add(i + 1, nx * push, ny * push, nz * push, u / na);
      add(j, -nx * push, -ny * push, -nz * push, (1 - t) / nb);
      add(j + 1, -nx * push, -ny * push, -nz * push, t / nb);
    }
    const cap = r / 2;
    for (let q = 0; q < m; q++) {
      const d = disp[q] as V3;
      const len = Math.hypot(d[0], d[1], d[2]);
      if (len < 1e-12) continue;
      const k = len > cap ? cap / len : 1;
      move(q, d[0] * k, d[1] * k, d[2] * k);
    }
    // a colisão estica o fio: devolve o comprimento antes da próxima iteração (o fio é inextensível)
    for (let pass = 0; pass < 4; pass++) keepLength(restLen);
  };

  const snapshot = (): V3[] => P.map((p) => [p[0], p[1], p[2]] as V3);
  const closed = (q: V3[]): V3[] => [...q, [(q[0] as V3)[0] + 1, (q[0] as V3)[1], (q[0] as V3)[2]] as V3];

  // fase 1: inflar
  let stagesDone = 0;
  for (let st = 1; st <= inflateStages; st++) {
    const r = rho0 + ((rho - rho0) * st) / inflateStages;
    // o fio encurta junto com a inflação (um ponto mais apertado gasta menos fio)
    const restNow = rest * (1 + (lengthScale - 1) * (st / inflateStages));
    for (let it = 0; it < inflateIters; it++) iterate(r, restNow);
    stagesDone++;
  }
  rest *= lengthScale;
  for (let it = 0; it < settleIters; it++) iterate(rho, rest);
  let best = snapshot();
  let bestRest = rest;
  // fase 2: apertar (encurta o fio enquanto a penetração máxima fica abaixo de 5% de ρ)
  for (let st = 0; st < tightenStages; st++) {
    rest *= tightenFactor;
    for (let it = 0; it < tightenIters; it++) iterate(rho, rest);
    const pen = Math.max(0, (2 * rho - cellMinDist(closed(snapshot()))) / rho);
    if (pen > 0.05) break;
    best = snapshot();
    bestRest = rest;
    stagesDone++;
  }
  const pts = closed(best);
  // normalização: nó 0 em x = -0,5 e z médio = 0 (a normalização em y fica a cargo do chamador)
  const sx = -0.5 - (pts[0] as V3)[0];
  let zm = 0;
  for (const p of pts) zm += p[2];
  zm /= pts.length;
  for (const p of pts) {
    p[0] += sx;
    p[2] -= zm;
  }
  const minDist = cellMinDist(pts);
  return {
    pts,
    length: bestRest * m,
    minDist,
    maxPenetration: Math.max(0, (2 * rho - minDist) / rho),
    stagesDone,
    minDistEver: Math.min(seen, minDist),
  };
}

/** Maior raio do fio (em larguras de ponto) para o qual o modelo relaxado foi medido (H1b: 0,12 → 1,79ρ). */
export const RELAXED_MAX_RHO = 0.12;
const relaxedCache = new Map<number, V3[]>();

/**
 * Célula relaxada do ponto baixo para o raio `rho` (cadeia periódica de 97 nós, último = primeiro + (1, 0, 0)), calculada
 * uma vez por raio (cerca de 0,6 s) e reaproveitada por todos os pontos. Acima de `RELAXED_MAX_RHO` devolve null: o
 * solver não foi testado ali e o chamador usa o modelo anterior.
 */
export function relaxedScCell(rho: number): V3[] | null {
  if (!(rho > 0) || rho > RELAXED_MAX_RHO) return null;
  const key = Math.round(rho * 1e4);
  let cell = relaxedCache.get(key);
  if (!cell) {
    cell = relaxCell(scCellPath(), { rho: key / 1e4 }).pts;
    relaxedCache.set(key, cell);
  }
  return cell;
}
