// SPDX-License-Identifier: GPL-3.0-or-later
// Relaxamento leve de espaçamento (R3c): move só os pontos livres (a seleção) para que as arestas voltem ao
// comprimento-alvo, com os vizinhos fixos como contorno. Jacobi (não depende da ordem das arestas), com limite de
// deslocamento e parada se o resíduo piorar. Sem colisão (isso fica para o R3d). Puro: sem DOM, sem relógio, sem acaso.

export interface RelaxInput {
  /** x, y, z por ponto (layout inteiro). */
  positions: ArrayLike<number>;
  /** Pares a, b (como em `LayoutOut.edges`). */
  edges: ArrayLike<number>;
  /** Tamanho relativo por ponto. */
  size: ArrayLike<number>;
  /** Índices que podem se mover (a seleção). */
  free: ArrayLike<number>;
  /** 0 a 100; padrão 20. */
  iterations?: number;
  /** Fração do comprimento-alvo local; padrão 0,5. */
  maxShift?: number;
}

export interface RelaxStats {
  free: number;
  edges: number;
  /** Iterações de fato mantidas. */
  iterations: number;
  residualBefore: number;
  residualAfter: number;
  /** Maior deslocamento aplicado a um ponto, em unidades do layout. */
  maxShift: number;
}

export function relaxSelection(i: RelaxInput): { positions: Float64Array; stats: RelaxStats } {
  const n = Math.floor(i.positions.length / 3);
  const pos = Float64Array.from(i.positions as ArrayLike<number>);
  const start = Float64Array.from(pos);
  const isFree = new Uint8Array(n);
  let freeCount = 0;
  for (let k = 0; k < i.free.length; k++) {
    const f = i.free[k] as number;
    if (Number.isInteger(f) && f >= 0 && f < n && !isFree[f]) {
      isFree[f] = 1;
      freeCount++;
    }
  }
  const sz = (p: number): number => {
    const v = i.size[p] as number;
    return Number.isFinite(v) && v > 0 ? v : 1;
  };
  const dist = (p: Float64Array, a: number, b: number): number =>
    Math.hypot(
      (p[b * 3] as number) - (p[a * 3] as number),
      (p[b * 3 + 1] as number) - (p[a * 3 + 1] as number),
      (p[b * 3 + 2] as number) - (p[a * 3 + 2] as number),
    );

  // k global: comprimento médio por unidade de tamanho, medido em todas as arestas (a mesma regra do layout)
  let sumLen = 0;
  let sumSize = 0;
  const all: number[] = [];
  for (let e = 0; e + 1 < i.edges.length; e += 2) {
    const a = i.edges[e] as number;
    const b = i.edges[e + 1] as number;
    if (!(a >= 0 && a < n && b >= 0 && b < n) || a === b) continue;
    all.push(a, b);
    sumLen += dist(pos, a, b);
    sumSize += (sz(a) + sz(b)) / 2;
  }
  const k = sumSize > 0 ? sumLen / sumSize : 1;

  // só as arestas com pelo menos uma ponta livre
  const used: number[] = [];
  const target: number[] = [];
  const degree = new Float64Array(n);
  for (let e = 0; e < all.length; e += 2) {
    const a = all[e] as number;
    const b = all[e + 1] as number;
    if (!isFree[a] && !isFree[b]) continue;
    used.push(a, b);
    target.push(k * ((sz(a) + sz(b)) / 2));
    degree[a] = (degree[a] as number) + 1;
    degree[b] = (degree[b] as number) + 1;
  }
  const edgeCount = used.length / 2;

  const residual = (p: Float64Array): number => {
    if (edgeCount === 0) return 0;
    let s = 0;
    for (let e = 0; e < edgeCount; e++) {
      const t = target[e] as number;
      if (t <= 0) continue;
      const d = (dist(p, used[e * 2] as number, used[e * 2 + 1] as number) - t) / t;
      s += d * d;
    }
    return Math.sqrt(s / edgeCount);
  };

  const iterations = Math.max(0, Math.min(100, Math.floor(i.iterations ?? 20)));
  const maxShift = Math.max(0, i.maxShift ?? 0.5);
  const before = residual(pos);
  let kept = 0;
  let current = before;
  const delta = new Float64Array(n * 3);

  for (let it = 0; it < iterations && edgeCount > 0 && freeCount > 0; it++) {
    delta.fill(0);
    for (let e = 0; e < edgeCount; e++) {
      const a = used[e * 2] as number;
      const b = used[e * 2 + 1] as number;
      const d = dist(pos, a, b);
      if (d < 1e-12) continue; // aresta degenerada: sem direção
      const corr = (d - (target[e] as number)) / d; // fração do vetor a→b a aproximar (+) ou afastar (−)
      const dx = ((pos[b * 3] as number) - (pos[a * 3] as number)) * corr;
      const dy = ((pos[b * 3 + 1] as number) - (pos[a * 3 + 1] as number)) * corr;
      const dz = ((pos[b * 3 + 2] as number) - (pos[a * 3 + 2] as number)) * corr;
      // livre–livre: metade cada; livre–fixo: a correção inteira no livre
      const wa = isFree[a] ? (isFree[b] ? 0.5 : 1) : 0;
      const wb = isFree[b] ? (isFree[a] ? 0.5 : 1) : 0;
      if (wa > 0) {
        delta[a * 3] = (delta[a * 3] as number) + dx * wa;
        delta[a * 3 + 1] = (delta[a * 3 + 1] as number) + dy * wa;
        delta[a * 3 + 2] = (delta[a * 3 + 2] as number) + dz * wa;
      }
      if (wb > 0) {
        delta[b * 3] = (delta[b * 3] as number) - dx * wb;
        delta[b * 3 + 1] = (delta[b * 3 + 1] as number) - dy * wb;
        delta[b * 3 + 2] = (delta[b * 3 + 2] as number) - dz * wb;
      }
    }
    // passo cheio de Jacobi pode passar do ponto: tenta w = 1, 1/2, 1/4... até o resíduo baixar
    let accepted = false;
    for (let w = 1; w >= 1 / 16 && !accepted; w /= 2) {
      const next = Float64Array.from(pos);
      for (let p = 0; p < n; p++) {
        if (!isFree[p] || !degree[p]) continue;
        const g = 1 / (degree[p] as number);
        let x = (pos[p * 3] as number) + (delta[p * 3] as number) * g * w;
        let y = (pos[p * 3 + 1] as number) + (delta[p * 3 + 1] as number) * g * w;
        let z = (pos[p * 3 + 2] as number) + (delta[p * 3 + 2] as number) * g * w;
        // deslocamento total em relação à origem limitado
        const lim = maxShift * k * sz(p);
        const ox = x - (start[p * 3] as number);
        const oy = y - (start[p * 3 + 1] as number);
        const oz = z - (start[p * 3 + 2] as number);
        const len = Math.hypot(ox, oy, oz);
        if (len > lim && len > 0) {
          const f = lim / len;
          x = (start[p * 3] as number) + ox * f;
          y = (start[p * 3 + 1] as number) + oy * f;
          z = (start[p * 3 + 2] as number) + oz * f;
        }
        next[p * 3] = x;
        next[p * 3 + 1] = y;
        next[p * 3 + 2] = z;
      }
      const r = residual(next);
      if (r < current - 1e-9) {
        pos.set(next);
        current = r;
        kept++;
        accepted = true;
      }
    }
    if (!accepted) break; // nenhum passo melhora (ou o ganho é desprezível): para
  }

  let shift = 0;
  for (let p = 0; p < n; p++) {
    if (!isFree[p]) continue;
    shift = Math.max(
      shift,
      Math.hypot(
        (pos[p * 3] as number) - (start[p * 3] as number),
        (pos[p * 3 + 1] as number) - (start[p * 3 + 1] as number),
        (pos[p * 3 + 2] as number) - (start[p * 3 + 2] as number),
      ),
    );
  }
  return {
    positions: pos,
    stats: {
      free: freeCount,
      edges: edgeCount,
      iterations: kept,
      residualBefore: before,
      residualAfter: current,
      maxShift: shift,
    },
  };
}
