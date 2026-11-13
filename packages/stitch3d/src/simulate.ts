// SPDX-License-Identifier: GPL-3.0-or-later
// Simulação ponto a ponto (R3d): em ordem de trabalho, cada ponto "sujo" se acomoda contra os pontos que já existem
// (índice ≤ dele): relaxa o espaçamento das arestas e, opcionalmente, afasta pontos não adjacentes que se sobrepõem
// (colisão). Com `moveBases` as bases sujas dele também se deslocam, com limite menor. Pontos limpos nunca se movem.
// Puro e determinístico: sem DOM, sem relógio, sem acaso. `step(n)` processa n pontos e pode ser chamado aos poucos
// (pausar/parar), com o mesmo resultado de uma chamada só.
import { createGrid } from "./spatial.ts";

export interface SimInput {
  /** Posições do layout base (x, y, z por ponto): referência dos limites de deslocamento e do espaçamento-alvo. */
  base: ArrayLike<number>;
  /** Posições de partida: o base mais os deslocamentos dos pontos limpos já simulados. */
  start: ArrayLike<number>;
  /** Pares a, b (arestas do layout). */
  edges: ArrayLike<number>;
  /** Bases (índices) de cada ponto. */
  parents: ArrayLike<number>[];
  size: ArrayLike<number>;
  /** 1 = simular este ponto. */
  dirty: ArrayLike<number>;
  /** 1 a 30; padrão 8. */
  iterations?: number;
  /** As bases sujas do ponto também se movem (limite menor). Padrão true. */
  moveBases?: boolean;
  /** Colisão entre pontos não adjacentes. Padrão true. */
  collision?: boolean;
}

export interface SimStats {
  simulated: number;
  /** Deslocamento em relação ao base, em unidades de k (comprimento por unidade de tamanho). */
  meanShift: number;
  maxShift: number;
  checksum: number;
}

export interface Simulation {
  /** Processa os próximos `count` pontos em ordem de trabalho; true = terminou. */
  step(count: number): boolean;
  cursor(): number;
  readonly positions: Float64Array;
  /** Comprimento médio por unidade de tamanho medido no layout base. */
  readonly k: number;
  stats(): SimStats;
}

const COLLISION = 0.7;

export function createSimulation(input: SimInput): Simulation {
  const n = Math.floor(input.base.length / 3);
  const pos = Float64Array.from(input.start as ArrayLike<number>);
  const base = input.base;
  const iterations = Math.max(1, Math.min(30, Math.floor(input.iterations ?? 8)));
  const moveBases = input.moveBases !== false;
  const collision = input.collision !== false;
  const sz = (p: number): number => {
    const v = input.size[p] as number;
    return Number.isFinite(v) && v > 0 ? v : 1;
  };

  const adj: number[][] = Array.from({ length: n }, () => []);
  const pair = new Set<number>();
  /** Comprimento de cada aresta no layout base: o alvo (o layout base é o equilíbrio). */
  const rest = new Map<number, number>();
  let sumLen = 0;
  let sumSize = 0;
  for (let e = 0; e + 1 < input.edges.length; e += 2) {
    const a = input.edges[e] as number;
    const b = input.edges[e + 1] as number;
    if (!(a >= 0 && a < n && b >= 0 && b < n) || a === b || pair.has(a * n + b)) continue;
    pair.add(a * n + b);
    pair.add(b * n + a);
    (adj[a] as number[]).push(b);
    (adj[b] as number[]).push(a);
    const baseLen = Math.hypot(
      (base[b * 3] as number) - (base[a * 3] as number),
      (base[b * 3 + 1] as number) - (base[a * 3 + 1] as number),
      (base[b * 3 + 2] as number) - (base[a * 3 + 2] as number),
    );
    rest.set(a * n + b, baseLen);
    rest.set(b * n + a, baseLen);
    sumLen += baseLen;
    sumSize += (sz(a) + sz(b)) / 2;
  }
  const k = sumSize > 0 ? sumLen / sumSize : 1;
  let maxSize = 1;
  for (let p = 0; p < n; p++) maxSize = Math.max(maxSize, sz(p));
  const reach = (p: number): number => COLLISION * k * ((sz(p) + maxSize) / 2);
  const grid = collision ? createGrid(COLLISION * k * maxSize, pos) : null;

  const dist = (a: number, b: number): number =>
    Math.hypot(
      (pos[b * 3] as number) - (pos[a * 3] as number),
      (pos[b * 3 + 1] as number) - (pos[a * 3 + 1] as number),
      (pos[b * 3 + 2] as number) - (pos[a * 3 + 2] as number),
    );

  /** Pontos próximos de `f` (índice ≤ i, não adjacentes) que penetram na distância mínima. */
  function crowd(f: number, i: number, fn: (o: number, d: number, thr: number) => void): void {
    if (!grid) return;
    grid.query(pos[f * 3] as number, pos[f * 3 + 1] as number, pos[f * 3 + 2] as number, reach(f), (o) => {
      if (o === f || o > i || pair.has(f * n + o)) return;
      const thr = COLLISION * k * ((sz(f) + sz(o)) / 2);
      const d = dist(f, o);
      if (d < thr) fn(o, d, thr);
    });
  }

  function energy(free: number[], i: number): number {
    let e = 0;
    for (const f of free) {
      for (const nb of adj[f] as number[]) {
        if (nb > i) continue;
        const L = rest.get(f * n + nb) as number;
        if (!(L > 0)) continue;
        const d = (dist(f, nb) - L) / L;
        e += d * d;
      }
      crowd(f, i, (_o, d, thr) => {
        const q = (thr - d) / thr;
        e += q * q;
      });
    }
    return e;
  }

  function simulatePoint(i: number): void {
    const free = [i];
    if (moveBases) {
      const ps = input.parents[i];
      for (let q = 0; ps && q < ps.length; q++) {
        const b = ps[q] as number;
        if (b >= 0 && b < i && input.dirty[b] && !free.includes(b)) free.push(b);
      }
    }
    const isFree = new Set(free);
    // limite único a partir do base (0,5·k·tamanho); as bases ainda têm um teto de 0,25·k·tamanho por ponto simulado
    const limit = (p: number): number => 0.5 * k * sz(p);
    const origin = free.map((f) => [pos[f * 3], pos[f * 3 + 1], pos[f * 3 + 2]] as number[]);
    let current = energy(free, i);
    for (let it = 0; it < iterations; it++) {
      // correções a partir das posições atuais (Jacobi)
      const delta = free.map(() => [0, 0, 0, 0]);
      free.forEach((f, idx) => {
        const d = delta[idx] as number[];
        for (const nb of adj[f] as number[]) {
          if (nb > i) continue;
          const len = dist(f, nb);
          if (len < 1e-12) continue;
          const L = rest.get(f * n + nb) as number;
          const corr = (len - L) / len;
          const w = isFree.has(nb) ? 0.5 : 1;
          for (let t = 0; t < 3; t++) {
            d[t] = (d[t] as number) + ((pos[nb * 3 + t] as number) - (pos[f * 3 + t] as number)) * corr * w;
          }
          d[3] = (d[3] as number) + 1;
        }
        crowd(f, i, (o, len, thr) => {
          if (len < 1e-12) return;
          const push = (thr - len) / len;
          const w = isFree.has(o) ? 0.5 : 1;
          for (let t = 0; t < 3; t++) {
            d[t] = (d[t] as number) + ((pos[f * 3 + t] as number) - (pos[o * 3 + t] as number)) * push * w;
          }
          d[3] = (d[3] as number) + 1;
        });
      });
      const before = free.map((f) => [pos[f * 3], pos[f * 3 + 1], pos[f * 3 + 2]] as number[]);
      let accepted = false;
      for (let w = 1; w >= 1 / 16 && !accepted; w /= 2) {
        free.forEach((f, idx) => {
          const d = delta[idx] as number[];
          const g = (1 / Math.max(1, d[3] as number)) * w;
          const old = before[idx] as number[];
          const nx = (old[0] as number) + (d[0] as number) * g;
          const ny = (old[1] as number) + (d[1] as number) * g;
          const nz = (old[2] as number) + (d[2] as number) * g;
          // limite de deslocamento a partir do base
          const ox = nx - (base[f * 3] as number);
          const oy = ny - (base[f * 3 + 1] as number);
          const oz = nz - (base[f * 3 + 2] as number);
          const l = Math.hypot(ox, oy, oz);
          const lim = limit(f);
          const s = l > lim && l > 0 ? lim / l : 1;
          let px = (base[f * 3] as number) + ox * s;
          let py = (base[f * 3 + 1] as number) + oy * s;
          let pz = (base[f * 3 + 2] as number) + oz * s;
          if (f !== i) {
            const o0 = origin[idx] as number[];
            const cx = px - (o0[0] as number);
            const cy = py - (o0[1] as number);
            const cz = pz - (o0[2] as number);
            const cl = Math.hypot(cx, cy, cz);
            const cap = 0.25 * k * sz(f);
            if (cl > cap && cl > 0) {
              px = (o0[0] as number) + (cx * cap) / cl;
              py = (o0[1] as number) + (cy * cap) / cl;
              pz = (o0[2] as number) + (cz * cap) / cl;
            }
          }
          grid?.move(f, pos[f * 3] as number, pos[f * 3 + 1] as number, pos[f * 3 + 2] as number, px, py, pz);
          pos[f * 3] = px;
          pos[f * 3 + 1] = py;
          pos[f * 3 + 2] = pz;
        });
        const e = energy(free, i);
        if (e < current - 1e-9) {
          current = e;
          accepted = true;
        } else {
          free.forEach((f, idx) => {
            const old = before[idx] as number[];
            const [ox, oy, oz] = [old[0] as number, old[1] as number, old[2] as number];
            grid?.move(
              f,
              pos[f * 3] as number,
              pos[f * 3 + 1] as number,
              pos[f * 3 + 2] as number,
              ox,
              oy,
              oz,
            );
            pos[f * 3] = ox;
            pos[f * 3 + 1] = oy;
            pos[f * 3 + 2] = oz;
          });
        }
      }
      if (!accepted) break;
    }
  }

  let cur = 0;
  return {
    positions: pos,
    k,
    cursor: () => cur,
    step(count) {
      for (let done = 0; done < count && cur < n; done++, cur++) {
        if (input.dirty[cur]) simulatePoint(cur);
      }
      return cur >= n;
    },
    stats() {
      let sim = 0;
      let sum = 0;
      let max = 0;
      for (let p = 0; p < cur; p++) {
        if (!input.dirty[p]) continue;
        sim++;
        const s =
          Math.hypot(
            (pos[p * 3] as number) - (base[p * 3] as number),
            (pos[p * 3 + 1] as number) - (base[p * 3 + 1] as number),
            (pos[p * 3 + 2] as number) - (base[p * 3 + 2] as number),
          ) / k;
        sum += s;
        max = Math.max(max, s);
      }
      let h = 0x811c9dc5;
      for (let i = 0; i < pos.length; i++) {
        h ^= Math.round((pos[i] as number) * 1e6) | 0;
        h = Math.imul(h, 0x01000193);
      }
      return { simulated: sim, meanShift: sim ? sum / sim : 0, maxShift: max, checksum: h >>> 0 };
    },
  };
}
