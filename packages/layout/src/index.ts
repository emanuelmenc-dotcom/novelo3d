// SPDX-License-Identifier: GPL-3.0-or-later
// Motor de posições 3D (D-17): cada ponto do grafo ganha uma posição, como no layout do CrochetPARADE
// (distâncias do grafo -> relaxação por "stress"). Diferenças deliberadas em relação ao graph.cpp do CP:
//  - início analítico (superfície de revolução a partir das contagens), não aleatório;
//  - descida estocástica do gradiente (Zheng et al., 2018) com sementes fixas: determinístico;
//  - para peças grandes, só distâncias a "pivôs" (O(N·k) em vez da matriz densa N×N do CP).
// Sem DOM, relógio nem aleatoriedade sem semente.
import type { StitchGraph } from "@novelo/core";

export interface LayoutOptions {
  /** Semente do gerador pseudoaleatório. */
  seed?: number;
  /** Passadas sobre todos os termos de distância. */
  epochs?: number;
  /** Número de pivôs no modo esparso. */
  pivots?: number;
  /** Até este número de nós usa todos os pares (modo denso). */
  denseMax?: number;
  /**
   * Tamanho relativo de cada ponto (1 = padrão; vem da tensão). O comprimento-alvo de uma aresta é
   * (tamanho_i + tamanho_j) / 2 e as distâncias usam Dijkstra; sem tamanhos diferentes, BFS (docs/15).
   */
  sizes?: ArrayLike<number>;
  /**
   * Posições de um layout anterior da mesma receita (3 números por nó): a descida parte delas, com passo menor e
   * poucas épocas (partida a quente). Serve quando só os tamanhos dos pontos mudaram.
   */
  initial?: ArrayLike<number>;
}

export interface LayoutStats {
  nodes: number;
  edges: number;
  mode: "dense" | "pivots";
  terms: number;
  /** Comprimento médio das arestas (alvo: 1 ponto). */
  meanEdge: number;
  /** Erro relativo médio das distâncias ajustadas. */
  relError: number;
}

export interface LayoutResult {
  /** x, y, z por nó, em unidades de largura de ponto, centrado na origem. */
  positions: Float32Array;
  /** Pares de nós ligados (a, b), a < b: arestas de carreira e de coluna. */
  edges: Int32Array;
  stats: LayoutStats;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Arestas do grafo de pontos: carreira (ao longo da volta) e coluna (para os pontos de base). */
export function graphEdges(graph: StitchGraph): Int32Array {
  const seen = new Set<number>();
  const out: number[] = [];
  const n = graph.nodes.length;
  const add = (a: number, b: number) => {
    if (a === b) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = lo * n + hi;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(lo, hi);
  };
  for (const row of graph.rows) {
    const count = row.last - row.first + 1;
    for (let i = row.first; i < row.last; i++) add(i, i + 1);
    if (row.kind === "round" && count > 2) add(row.last, row.first);
  }
  for (const node of graph.nodes) for (const p of node.parents) add(node.id, p);
  return Int32Array.from(out);
}

/** Posição inicial: superfície de revolução montada só com as contagens (docs/09, nível analítico). */
function initialPositions(graph: StitchGraph, rnd: () => number): Float32Array {
  const n = graph.nodes.length;
  const pos = new Float32Array(n * 3);
  const jitter = () => (rnd() - 0.5) * 0.1;
  let z = 0;
  let prevR = 0;
  graph.rows.forEach((row, ri) => {
    const count = row.last - row.first + 1;
    const r = count / (2 * Math.PI);
    if (row.kind === "row") {
      for (let k = 0; k < count; k++) {
        const i = (row.first + k) * 3;
        pos[i] = k - count / 2 + jitter();
        pos[i + 1] = ri + jitter();
        pos[i + 2] = jitter();
      }
      return;
    }
    if (ri > 0) z += Math.sqrt(Math.max(0, 1 - (r - prevR) ** 2));
    prevR = r;
    for (let k = 0; k < count; k++) {
      const th = (2 * Math.PI * (k + 0.5)) / count;
      const i = (row.first + k) * 3;
      pos[i] = r * Math.cos(th) + jitter();
      pos[i + 1] = r * Math.sin(th) + jitter();
      pos[i + 2] = z + jitter();
    }
  });
  // nós fora de qualquer volta (o anel mágico): logo abaixo do primeiro anel
  const inRow = new Uint8Array(n);
  for (const row of graph.rows) for (let i = row.first; i <= row.last; i++) inRow[i] = 1;
  for (let i = 0; i < n; i++) {
    if (inRow[i]) continue;
    const first = graph.rows[0];
    const r0 = first ? (first.last - first.first + 1) / (2 * Math.PI) : 0;
    pos[i * 3] = jitter();
    pos[i * 3 + 1] = jitter();
    pos[i * 3 + 2] = -Math.sqrt(Math.max(0.05, 1 - r0 * r0)) + jitter();
  }
  return pos;
}

function csr(n: number, edges: Int32Array): { start: Int32Array; adj: Int32Array } {
  const deg = new Int32Array(n + 1);
  for (let e = 0; e < edges.length; e += 2) {
    const a = (edges[e] as number) + 1;
    const b = (edges[e + 1] as number) + 1;
    deg[a] = (deg[a] as number) + 1;
    deg[b] = (deg[b] as number) + 1;
  }
  for (let i = 0; i < n; i++) deg[i + 1] = (deg[i + 1] as number) + (deg[i] as number);
  const start = Int32Array.from(deg);
  const fill = Int32Array.from(deg.subarray(0, n));
  const adj = new Int32Array(edges.length);
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e] as number;
    const b = edges[e + 1] as number;
    const pa = fill[a] as number;
    fill[a] = pa + 1;
    adj[pa] = b;
    const pb = fill[b] as number;
    fill[b] = pb + 1;
    adj[pb] = a;
  }
  return { start, adj };
}

/** Distâncias mínimas com peso de aresta (t_i + t_j)/2 (Dijkstra com heap binário). */
function dijkstra(
  n: number,
  g: { start: Int32Array; adj: Int32Array },
  size: ArrayLike<number>,
  src: number,
  dist: Float32Array,
): void {
  dist.fill(Number.POSITIVE_INFINITY);
  const heapD: number[] = [0];
  const heapV: number[] = [src];
  dist[src] = 0;
  const swap = (a: number, b: number) => {
    const d = heapD[a] as number;
    const v = heapV[a] as number;
    heapD[a] = heapD[b] as number;
    heapV[a] = heapV[b] as number;
    heapD[b] = d;
    heapV[b] = v;
  };
  while (heapD.length > 0) {
    const du = heapD[0] as number;
    const u = heapV[0] as number;
    const lastD = heapD.pop() as number;
    const lastV = heapV.pop() as number;
    if (heapD.length > 0) {
      heapD[0] = lastD;
      heapV[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const rr = l + 1;
        let m = i;
        if (l < heapD.length && (heapD[l] as number) < (heapD[m] as number)) m = l;
        if (rr < heapD.length && (heapD[rr] as number) < (heapD[m] as number)) m = rr;
        if (m === i) break;
        swap(i, m);
        i = m;
      }
    }
    if (du > (dist[u] as number)) continue;
    for (let k = g.start[u] as number; k < (g.start[u + 1] as number); k++) {
      const v = g.adj[k] as number;
      const nd = du + ((size[u] as number) + (size[v] as number)) * 0.5;
      // tolerância: a distância é guardada em float32 e caminhos empatados (comuns em malhas) se re-relaxariam sem fim
      if (nd + 1e-5 < (dist[v] as number)) {
        dist[v] = nd;
        heapD.push(nd);
        heapV.push(v);
        let i = heapD.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if ((heapD[p] as number) <= (heapD[i] as number)) break;
          swap(p, i);
          i = p;
        }
      }
    }
  }
}

function bfs(n: number, g: { start: Int32Array; adj: Int32Array }, src: number, dist: Float32Array): void {
  dist.fill(Number.POSITIVE_INFINITY);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  dist[src] = 0;
  queue[tail++] = src;
  while (head < tail) {
    const u = queue[head++] as number;
    const du = dist[u] as number;
    for (let k = g.start[u] as number; k < (g.start[u + 1] as number); k++) {
      const v = g.adj[k] as number;
      if (dist[v] === Number.POSITIVE_INFINITY) {
        dist[v] = du + 1;
        queue[tail++] = v;
      }
    }
  }
}

export function layoutGraph(graph: StitchGraph, options: LayoutOptions = {}): LayoutResult {
  const n = graph.nodes.length;
  const seed = options.seed ?? 1;
  const rnd = mulberry32(seed);
  const edges = graphEdges(graph);
  const warm = !!options.initial && options.initial.length === n * 3;
  const pos = warm ? Float32Array.from(options.initial as ArrayLike<number>) : initialPositions(graph, rnd);
  const denseMax = options.denseMax ?? 1200;
  const dense = n <= denseMax;
  const g = csr(n, edges);
  const sizes = options.sizes;
  let weighted = false;
  if (sizes) for (let i = 0; i < n; i++) if (Math.abs((sizes[i] as number) - 1) > 1e-6) weighted = true;
  const short = (src: number) =>
    weighted && sizes ? dijkstra(n, g, sizes, src, dist) : bfs(n, g, src, dist);
  const edgeLen = (a: number, b: number) =>
    weighted && sizes ? ((sizes[a] as number) + (sizes[b] as number)) * 0.5 : 1;

  // termos de distância (i, j, d)
  const ti: number[] = [];
  const tj: number[] = [];
  const td: number[] = [];
  const dist = new Float32Array(n);
  if (dense) {
    for (let i = 0; i < n; i++) {
      short(i);
      for (let j = i + 1; j < n; j++) {
        const d = dist[j] as number;
        if (d !== Number.POSITIVE_INFINITY) {
          ti.push(i);
          tj.push(j);
          td.push(d);
        }
      }
    }
  } else {
    const k = Math.min(n, options.pivots ?? 32);
    const minDist = new Float32Array(n).fill(Number.POSITIVE_INFINITY);
    let pivot = 0;
    for (let p = 0; p < k; p++) {
      short(pivot);
      let far = pivot;
      let farD = -1;
      for (let i = 0; i < n; i++) {
        const d = dist[i] as number;
        if (d !== Number.POSITIVE_INFINITY && i !== pivot) {
          ti.push(i);
          tj.push(pivot);
          td.push(d);
        }
        if (d < (minDist[i] as number)) minDist[i] = d;
        if ((minDist[i] as number) !== Number.POSITIVE_INFINITY && (minDist[i] as number) > farD) {
          farD = minDist[i] as number;
          far = i;
        }
      }
      pivot = far;
    }
    for (let e = 0; e < edges.length; e += 2) {
      ti.push(edges[e] as number);
      tj.push(edges[e + 1] as number);
      td.push(edgeLen(edges[e] as number, edges[e + 1] as number));
    }
  }
  const terms = td.length;
  const order = new Int32Array(terms);
  for (let i = 0; i < terms; i++) order[i] = i;

  // descida estocástica do gradiente do stress, passo decrescente (Zheng et al.)
  const epochs = options.epochs ?? (warm ? 8 : dense ? 60 : 40);
  let dMin = Number.POSITIVE_INFINITY;
  let dMax = 0;
  for (let i = 0; i < terms; i++) {
    const d = td[i] as number;
    if (d < dMin) dMin = d;
    if (d > dMax) dMax = d;
  }
  if (terms > 0) {
    // modo esparso: o início analítico já é bom; passo máximo limitado para só ajustar o local
    const etaMax = warm ? dMin * dMin : dense ? dMax * dMax : Math.min(dMax * dMax, 16);
    const etaMin = 0.01 * dMin * dMin;
    const lambda = epochs > 1 ? Math.log(etaMax / etaMin) / (epochs - 1) : 0;
    for (let e = 0; e < epochs; e++) {
      const eta = etaMax * Math.exp(-lambda * e);
      for (let i = terms - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = order[i] as number;
        order[i] = order[j] as number;
        order[j] = t;
      }
      for (let o = 0; o < terms; o++) {
        const t = order[o] as number;
        const a = (ti[t] as number) * 3;
        const b = (tj[t] as number) * 3;
        const d = td[t] as number;
        const mu = Math.min(eta / (d * d), 1);
        let dx = (pos[a] as number) - (pos[b] as number);
        let dy = (pos[a + 1] as number) - (pos[b + 1] as number);
        let dz = (pos[a + 2] as number) - (pos[b + 2] as number);
        let mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (mag < 1e-6) {
          dx = rnd() - 0.5;
          dy = rnd() - 0.5;
          dz = rnd() - 0.5;
          mag = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        }
        const s = (mu * (mag - d)) / (2 * mag);
        pos[a] = (pos[a] as number) - s * dx;
        pos[a + 1] = (pos[a + 1] as number) - s * dy;
        pos[a + 2] = (pos[a + 2] as number) - s * dz;
        pos[b] = (pos[b] as number) + s * dx;
        pos[b + 1] = (pos[b + 1] as number) + s * dy;
        pos[b + 2] = (pos[b + 2] as number) + s * dz;
      }
    }
  }

  // centro na origem
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += pos[i * 3] as number;
    cy += pos[i * 3 + 1] as number;
    cz += pos[i * 3 + 2] as number;
  }
  if (n > 0) {
    cx /= n;
    cy /= n;
    cz /= n;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (pos[i * 3] as number) - cx;
      pos[i * 3 + 1] = (pos[i * 3 + 1] as number) - cy;
      pos[i * 3 + 2] = (pos[i * 3 + 2] as number) - cz;
    }
  }

  // reescala global: aresta média = 1 ponto (mesma etapa do CP, "rescaleCoordinates")
  if (edges.length > 0) {
    let sum = 0;
    for (let e = 0; e < edges.length; e += 2) {
      const a = (edges[e] as number) * 3;
      const b = (edges[e + 1] as number) * 3;
      sum += Math.hypot(
        (pos[a] as number) - (pos[b] as number),
        (pos[a + 1] as number) - (pos[b + 1] as number),
        (pos[a + 2] as number) - (pos[b + 2] as number),
      );
    }
    let target = 0;
    for (let e = 0; e < edges.length; e += 2) target += edgeLen(edges[e] as number, edges[e + 1] as number);
    const mean = sum / target;
    if (mean > 0) for (let i = 0; i < pos.length; i++) pos[i] = (pos[i] as number) / mean;
  }

  return { positions: pos, edges, stats: measure(pos, edges, ti, tj, td, n, dense ? "dense" : "pivots") };
}

function measure(
  pos: Float32Array,
  edges: Int32Array,
  ti: number[],
  tj: number[],
  td: number[],
  n: number,
  mode: "dense" | "pivots",
): LayoutStats {
  const dist = (a: number, b: number) =>
    Math.hypot(
      (pos[a * 3] as number) - (pos[b * 3] as number),
      (pos[a * 3 + 1] as number) - (pos[b * 3 + 1] as number),
      (pos[a * 3 + 2] as number) - (pos[b * 3 + 2] as number),
    );
  let sumE = 0;
  for (let e = 0; e < edges.length; e += 2) sumE += dist(edges[e] as number, edges[e + 1] as number);
  const edgeCount = edges.length / 2;
  const step = Math.max(1, Math.floor(td.length / 200_000));
  let err = 0;
  let cnt = 0;
  for (let t = 0; t < td.length; t += step) {
    const d = td[t] as number;
    err += Math.abs(dist(ti[t] as number, tj[t] as number) - d) / d;
    cnt++;
  }
  return {
    nodes: n,
    edges: edgeCount,
    mode,
    terms: td.length,
    meanEdge: edgeCount > 0 ? sumE / edgeCount : 0,
    relError: cnt > 0 ? err / cnt : 0,
  };
}

/** Correlação de Pearson entre as distâncias entre pares de dois conjuntos de posições (mesmos nós). */
export function pairDistanceCorrelation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.floor(a.length / 3);
  const at = (arr: ArrayLike<number>, i: number) => arr[i] as number;
  const da: number[] = [];
  const db: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      da.push(
        Math.hypot(
          at(a, i * 3) - at(a, j * 3),
          at(a, i * 3 + 1) - at(a, j * 3 + 1),
          at(a, i * 3 + 2) - at(a, j * 3 + 2),
        ),
      );
      db.push(
        Math.hypot(
          at(b, i * 3) - at(b, j * 3),
          at(b, i * 3 + 1) - at(b, j * 3 + 1),
          at(b, i * 3 + 2) - at(b, j * 3 + 2),
        ),
      );
    }
  }
  const m = da.length;
  const ma = da.reduce((s, v) => s + v, 0) / m;
  const mb = db.reduce((s, v) => s + v, 0) / m;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let k = 0; k < m; k++) {
    const x = (da[k] as number) - ma;
    const y = (db[k] as number) - mb;
    sab += x * y;
    saa += x * x;
    sbb += y * y;
  }
  return sab / Math.sqrt(saa * sbb);
}
