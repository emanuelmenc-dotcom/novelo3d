// SPDX-License-Identifier: GPL-3.0-or-later
// Malha livre -> receita, rota A (P5d, protótipo; docs/08 seção 3): distância geodésica a partir de uma semente, voltas
// nas isolinhas a cada altura de volta, contagem pelo comprimento do laço e acoplamento no espaço. Reimplementado a partir
// do artigo do AmiGo, sem código do repositório dele (licença não comercial). Onde uma isolinha vira dois laços (braços,
// pernas), a malha é dividida: o corpo segue e cada galho vira uma peça própria, aberta na emenda para costurar.
import { type Issue, type Pattern, type Result, type Row, roundCount, validate } from "@novelo/core";
import { coupleBy, DEFAULTS, type ForwardOptions, type Gauge, opsOf } from "./index.ts";

type V3 = [number, number, number];

export interface Mesh {
  /** x, y, z de cada vértice (mm). */
  vertices: number[];
  /** Três índices de vértice por triângulo. */
  faces: number[];
}

/** Lê STL ASCII (texto) ou binário (bytes) e junta os vértices repetidos. */
export function parseStl(input: string | Uint8Array): Mesh {
  const raw: number[] = [];
  const ascii =
    typeof input === "string"
      ? input
      : // binário de verdade às vezes começa com "solid"; só trata como texto se tiver "facet"
        new TextDecoder().decode(input.subarray(0, Math.min(input.length, 1000))).includes("facet normal") &&
          /^\s*solid/.test(new TextDecoder().decode(input.subarray(0, 80)))
        ? new TextDecoder().decode(input)
        : null;
  if (ascii !== null) {
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    for (let m = re.exec(ascii); m; m = re.exec(ascii)) raw.push(Number(m[1]), Number(m[2]), Number(m[3]));
  } else {
    const b = input as Uint8Array;
    if (b.length < 84) throw new Error("STL binário curto demais");
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const n = dv.getUint32(80, true);
    if (b.length < 84 + n * 50) throw new Error("STL binário incompleto");
    for (let i = 0; i < n; i++)
      for (let v = 0; v < 3; v++)
        for (let k = 0; k < 3; k++) raw.push(dv.getFloat32(84 + i * 50 + 12 + v * 12 + k * 4, true));
  }
  if (raw.length === 0 || raw.length % 9 !== 0 || raw.some((x) => !Number.isFinite(x)))
    throw new Error("o arquivo não parece um STL com triângulos");
  const vertices: number[] = [];
  const faces: number[] = [];
  const index = new Map<string, number>();
  for (let i = 0; i < raw.length; i += 3) {
    const key = `${(raw[i] as number).toFixed(5)},${(raw[i + 1] as number).toFixed(5)},${(raw[i + 2] as number).toFixed(5)}`;
    let id = index.get(key);
    if (id === undefined) {
      id = vertices.length / 3;
      index.set(key, id);
      vertices.push(raw[i] as number, raw[i + 1] as number, raw[i + 2] as number);
    }
    faces.push(id);
  }
  return { vertices, faces };
}

const vtx = (m: Mesh, i: number): V3 => [
  m.vertices[i * 3] as number,
  m.vertices[i * 3 + 1] as number,
  m.vertices[i * 3 + 2] as number,
];
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

/** Toda aresta em exatamente dois triângulos: superfície fechada. */
function closed(m: Mesh): boolean {
  const count = new Map<string, number>();
  for (let f = 0; f < m.faces.length; f += 3)
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(m.faces[f + k] as number, m.faces[f + ((k + 1) % 3)] as number);
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  for (const c of count.values()) if (c !== 2) return false;
  return true;
}

/** Divide os triângulos em 4 até nenhuma aresta passar de `maxEdge` (a distância pelas arestas fica mais fiel). */
function refine(m: Mesh, maxEdge: number, maxFaces = 400_000): Mesh {
  let cur = m;
  for (let round = 0; round < 8; round++) {
    let longest = 0;
    for (let f = 0; f < cur.faces.length; f += 3)
      for (let k = 0; k < 3; k++)
        longest = Math.max(
          longest,
          dist(vtx(cur, cur.faces[f + k] as number), vtx(cur, cur.faces[f + ((k + 1) % 3)] as number)),
        );
    if (longest <= maxEdge || cur.faces.length * 4 > maxFaces * 3) break;
    const vertices = [...cur.vertices];
    const mids = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const key = edgeKey(a, b);
      let id = mids.get(key);
      if (id === undefined) {
        const p = vtx(cur, a);
        const q = vtx(cur, b);
        id = vertices.length / 3;
        vertices.push((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
        mids.set(key, id);
      }
      return id;
    };
    const faces: number[] = [];
    for (let f = 0; f < cur.faces.length; f += 3) {
      const [a, b, c] = [cur.faces[f] as number, cur.faces[f + 1] as number, cur.faces[f + 2] as number];
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      faces.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    cur = { vertices, faces };
  }
  return cur;
}

/** Vizinhança compacta (cada aresta nos dois sentidos, com o comprimento): feita uma vez por malha. */
interface Graph {
  start: Int32Array;
  nbr: Int32Array;
  len: Float64Array;
}
const graphs = new WeakMap<Mesh, Graph>();
function graphOf(m: Mesh): Graph {
  const cached = graphs.get(m);
  if (cached) return cached;
  const n = m.vertices.length / 3;
  const deg = new Int32Array(n + 1);
  for (let f = 0; f < m.faces.length; f += 3)
    for (let k = 0; k < 3; k++) {
      deg[m.faces[f + k] as number] = (deg[m.faces[f + k] as number] as number) + 1;
      deg[m.faces[f + ((k + 1) % 3)] as number] = (deg[m.faces[f + ((k + 1) % 3)] as number] as number) + 1;
    }
  const start = new Int32Array(n + 1);
  for (let v = 0; v < n; v++) start[v + 1] = (start[v] as number) + (deg[v] as number);
  const fill = start.slice(0, n);
  const nbr = new Int32Array(start[n] as number);
  const len = new Float64Array(start[n] as number);
  const V = m.vertices;
  const put = (a: number, b: number) => {
    const at = fill[a] as number;
    nbr[at] = b;
    len[at] = Math.hypot(
      (V[a * 3] as number) - (V[b * 3] as number),
      (V[a * 3 + 1] as number) - (V[b * 3 + 1] as number),
      (V[a * 3 + 2] as number) - (V[b * 3 + 2] as number),
    );
    fill[a] = at + 1;
  };
  for (let f = 0; f < m.faces.length; f += 3)
    for (let k = 0; k < 3; k++) {
      const a = m.faces[f + k] as number;
      const b = m.faces[f + ((k + 1) % 3)] as number;
      put(a, b);
      put(b, a);
    }
  const g = { start, nbr, len };
  graphs.set(m, g);
  return g;
}

/** Distância geodésica aproximada (Dijkstra pelas arestas) até a semente, só andando por vértices em `ok` (todos, sem `ok`). */
function geodesic(m: Mesh, seed: number, ok?: Uint8Array): Float64Array {
  const { start, nbr, len } = graphOf(m);
  const n = m.vertices.length / 3;
  const d = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  d[seed] = 0;
  // fila de prioridade (heap binário) em arrays: distância e vértice
  let cap = 1024;
  let keys = new Float64Array(cap);
  let vals = new Int32Array(cap);
  let size = 0;
  const push = (k: number, v: number) => {
    if (size === cap) {
      cap *= 2;
      const k2 = new Float64Array(cap);
      k2.set(keys);
      keys = k2;
      const v2 = new Int32Array(cap);
      v2.set(vals);
      vals = v2;
    }
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((keys[p] as number) <= k) break;
      keys[i] = keys[p] as number;
      vals[i] = vals[p] as number;
      i = p;
    }
    keys[i] = k;
    vals[i] = v;
  };
  push(0, seed);
  while (size > 0) {
    const du = keys[0] as number;
    const u = vals[0] as number;
    size--;
    const lk = keys[size] as number;
    const lv = vals[size] as number;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= size) break;
      const r = l + 1;
      const c = r < size && (keys[r] as number) < (keys[l] as number) ? r : l;
      if ((keys[c] as number) >= lk) break;
      keys[i] = keys[c] as number;
      vals[i] = vals[c] as number;
      i = c;
    }
    keys[i] = lk;
    vals[i] = lv;
    if (du > (d[u] as number)) continue;
    for (let e = start[u] as number; e < (start[u + 1] as number); e++) {
      const v = nbr[e] as number;
      if (ok && !ok[v]) continue;
      const nd = du + (len[e] as number);
      if (nd < (d[v] as number)) {
        d[v] = nd;
        push(nd, v);
      }
    }
  }
  return d;
}

/** Laço (ou trecho aberto, perto de uma emenda) de uma isolinha, com o valor de `aux` em cada ponto. */
interface Iso {
  pts: V3[];
  aux: number[];
  /** Um vértice do lado de cima da isolinha (serve para saber de que região o laço é). */
  above: number;
}

/** Isolinhas de `d` no nível `level`, só nos triângulos com os três vértices em `ok` (todos, sem `ok`). */
/** Triângulos em ordem da menor distância de cada um: uma isolinha só precisa olhar os que começam abaixo do nível. */
interface LevelIndex {
  order: Int32Array;
  min: Float64Array;
  max: Float64Array;
}
function levelIndex(m: Mesh, d: Float64Array): LevelIndex {
  const nf = m.faces.length / 3;
  const min = new Float64Array(nf);
  const max = new Float64Array(nf);
  for (let f = 0; f < nf; f++) {
    const a = d[m.faces[f * 3] as number] as number;
    const b = d[m.faces[f * 3 + 1] as number] as number;
    const c = d[m.faces[f * 3 + 2] as number] as number;
    min[f] = Math.min(a, b, c);
    max[f] = Math.max(a, b, c);
  }
  const order = Int32Array.from({ length: nf }, (_, f) => f).sort(
    (x, y) => (min[x] as number) - (min[y] as number),
  );
  return { order, min, max };
}

function isolines(
  m: Mesh,
  d: Float64Array,
  level: number,
  ok?: Uint8Array,
  aux?: Float64Array,
  index?: LevelIndex,
): Iso[] {
  const nv = m.vertices.length / 3;
  const pt = new Map<number, { p: V3; a: number; above: number }>();
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    if (!links.has(a)) links.set(a, []);
    if (!links.has(b)) links.set(b, []);
    (links.get(a) as number[]).push(b);
    (links.get(b) as number[]).push(a);
  };
  const ix = index ?? levelIndex(m, d);
  for (const face of ix.order) {
    if ((ix.min[face] as number) > level) break;
    if ((ix.max[face] as number) <= level) continue;
    const f = face * 3;
    if (ok && !(ok[m.faces[f] as number] && ok[m.faces[f + 1] as number] && ok[m.faces[f + 2] as number]))
      continue;
    const hits: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = m.faces[f + k] as number;
      const b = m.faces[f + ((k + 1) % 3)] as number;
      const da = d[a] as number;
      const db = d[b] as number;
      // cruza a aresta: um lado abaixo do nível e o outro acima (o "igual" fica do lado de baixo, sem ponto repetido)
      if (da <= level !== db <= level) {
        const key = a < b ? a * nv + b : b * nv + a;
        if (!pt.has(key)) {
          const t = (level - da) / (db - da);
          const p = vtx(m, a);
          const q = vtx(m, b);
          const xa = aux ? (aux[a] as number) : 0;
          const xb = aux ? (aux[b] as number) : 0;
          pt.set(key, {
            p: [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t],
            a: xa + (xb - xa) * t,
            above: da > level ? a : b,
          });
        }
        hits.push(key);
      }
    }
    if (hits.length === 2) link(hits[0] as number, hits[1] as number);
  }
  const seen = new Set<number>();
  const out: Iso[] = [];
  // começa pelas pontas dos trechos abertos (um vizinho só), depois pelos laços fechados
  const ends = [...links.keys()].filter((k) => (links.get(k) as number[]).length === 1);
  for (const start of [...ends, ...links.keys()]) {
    if (seen.has(start)) continue;
    const iso: Iso = { pts: [], aux: [], above: (pt.get(start) as { above: number }).above };
    let prev = -1;
    let cur = start;
    while (!seen.has(cur)) {
      seen.add(cur);
      const q = pt.get(cur) as { p: V3; a: number };
      iso.pts.push(q.p);
      iso.aux.push(q.a);
      const next = (links.get(cur) as number[]).find((x) => x !== prev && !seen.has(x));
      if (!next) break;
      prev = cur;
      cur = next;
    }
    if (iso.pts.length >= 3) out.push(iso);
  }
  return out;
}

const lengthOf = (loop: V3[]) => loop.reduce((a, p, i) => a + dist(p, loop[(i + 1) % loop.length] as V3), 0);

/** Normal do laço pelo método de Newell (o sentido diz se o laço gira para um lado ou para o outro). */
function normalOf(loop: V3[]): V3 {
  const n: V3 = [0, 0, 0];
  loop.forEach((p, i) => {
    const q = loop[(i + 1) % loop.length] as V3;
    n[0] += (p[1] - q[1]) * (p[2] + q[2]);
    n[1] += (p[2] - q[2]) * (p[0] + q[0]);
    n[2] += (p[0] - q[0]) * (p[1] + q[1]);
  });
  return n;
}
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const centroid = (loop: V3[]): V3 => {
  const c: V3 = [0, 0, 0];
  for (const p of loop) {
    c[0] += p[0] / loop.length;
    c[1] += p[1] / loop.length;
    c[2] += p[2] / loop.length;
  }
  return c;
};

/** `n` pontos espaçados igualmente ao longo do laço, começando no ponto do laço mais perto de `seam`. */
function spread3(loop: V3[], n: number, seam: V3): V3[] {
  let s0 = 0;
  loop.forEach((p, i) => {
    if (dist(p, seam) < dist(loop[s0] as V3, seam)) s0 = i;
  });
  const ring = [...loop.slice(s0), ...loop.slice(0, s0)];
  const L = lengthOf(ring);
  const out: V3[] = [];
  let acc = 0;
  let k = 0;
  for (let i = 0; i < ring.length && k < n; i++) {
    const p = ring[i] as V3;
    const q = ring[(i + 1) % ring.length] as V3;
    const seg = dist(p, q);
    while (k < n && (k * L) / n <= acc + seg + 1e-12) {
      const t = seg > 0 ? ((k * L) / n - acc) / seg : 0;
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
      k++;
    }
    acc += seg;
  }
  while (out.length < n) out.push(ring[0] as V3);
  return out;
}

/** Vértices ligados a `start` pelas arestas, só passando por vértices com `d > level` (e em `ok`, se houver). */
function regionAbove(
  m: Mesh,
  adj: number[][],
  d: Float64Array,
  level: number,
  start: number,
  ok?: Uint8Array,
): Uint8Array {
  const out = new Uint8Array(m.vertices.length / 3);
  const stack = [start];
  out[start] = 1;
  while (stack.length > 0) {
    const u = stack.pop() as number;
    for (const v of adj[u] as number[]) {
      if (out[v] || (d[v] as number) <= level || (ok && !ok[v])) continue;
      out[v] = 1;
      stack.push(v);
    }
  }
  return out;
}

export interface MeshPiece {
  /** "Corpo" (a peça da semente) ou "Parte 2", "Parte 3"... */
  name: string;
  counts: number[];
  pattern: Pattern;
  /** Peça aberta na emenda (para costurar), em vez de fechada. */
  open: boolean;
  /** Onde costurar: índice da peça e volta (1 em diante) dela em que esta peça encosta. */
  attachTo: { piece: number; row: number } | null;
}

export interface MeshOutput {
  /** A peça principal (o corpo), igual a `pieces[0]`: contagens e receita. */
  counts: number[];
  pattern: Pattern;
  /** Todas as peças: o corpo e uma por ramificação (braço, perna...), cada uma começando na ponta. */
  pieces: MeshPiece[];
  /** Comprimento geodésico da semente ao ponto mais longe (mm). */
  length: number;
  triangles: number;
}

/** Junta trechos abertos de isolinha (cortados por uma emenda) num laço só, ligando sempre a ponta mais perto. */
function joinOpen(chains: Iso[]): Iso {
  const rest = chains.slice(1);
  const out: Iso = {
    pts: [...(chains[0] as Iso).pts],
    aux: [...(chains[0] as Iso).aux],
    above: (chains[0] as Iso).above,
  };
  while (rest.length > 0) {
    const end = out.pts[out.pts.length - 1] as V3;
    let best = 0;
    let flip = false;
    let bd = Number.POSITIVE_INFINITY;
    rest.forEach((c, i) => {
      const a = dist(end, c.pts[0] as V3);
      const b = dist(end, c.pts[c.pts.length - 1] as V3);
      if (a < bd) [bd, best, flip] = [a, i, false];
      if (b < bd) [bd, best, flip] = [b, i, true];
    });
    const c = rest.splice(best, 1)[0] as Iso;
    out.pts.push(...(flip ? [...c.pts].reverse() : c.pts));
    out.aux.push(...(flip ? [...c.aux].reverse() : c.aux));
  }
  return out;
}

interface Arm {
  tip: number;
  field: Float64Array;
  /** Nível (na distância a partir da ponta) em que o tubo encontra o corpo. */
  junction: number;
  region: Uint8Array;
}

/**
 * Galhos (braços, pernas, orelhas): a partir de cada ponta (máximo local da distância à semente), as isolinhas formam um
 * tubo; onde o laço de repente fica muito maior que o anterior, ou se divide, o tubo encontrou o corpo: ali é a emenda.
 */
function findArms(m: Mesh, d0: Float64Array, adj: number[][], h: number, maxArms = 24): Arm[] {
  const nv = m.vertices.length / 3;
  const tips: number[] = [];
  // ponta: o ponto mais longe da semente num raio de duas voltas em volta dele (tira os máximos de ruído da malha)
  const isTip = (v: number): boolean => {
    const dv = d0[v] as number;
    const seen = new Map<number, number>([[v, 0]]);
    const stack = [v];
    while (stack.length > 0) {
      const u = stack.pop() as number;
      const du = seen.get(u) as number;
      for (const x of adj[u] as number[]) {
        if ((d0[x] as number) > dv) return false;
        const dx = du + dist(vtx(m, u), vtx(m, x));
        if (dx <= 2 * h && dx < (seen.get(x) ?? Number.POSITIVE_INFINITY)) {
          seen.set(x, dx);
          stack.push(x);
        }
      }
    }
    return true;
  };
  for (let v = 0; v < nv; v++)
    if ((adj[v] as number[]).every((u) => (d0[u] as number) <= (d0[v] as number)) && isTip(v)) tips.push(v);
  tips.sort((a, b) => (d0[b] as number) - (d0[a] as number));
  const covered = new Uint8Array(nv);
  const arms: Arm[] = [];
  let tested = 0;
  for (const tip of tips) {
    if (covered[tip] || tested >= maxArms * 3) continue;
    tested++;
    const dt = geodesic(m, tip);
    const ix = levelIndex(m, dt);
    // tubo: o laço fica do mesmo tamanho por pelo menos duas voltas; depois disso, se ele alarga muito ou se divide,
    // chegou no corpo. Sem trecho de tubo (a calota de uma esfera, que só cresce), não é galho.
    let prevLen = 0;
    let stable = 0;
    let tube = 0;
    let junction = -1;
    for (let i = 1; ; i++) {
      const level = i * h;
      const found = isolines(m, dt, level, undefined, undefined, ix);
      if (found.length === 0) break;
      const len = Math.max(...found.map((x) => lengthOf(x.pts)));
      if (tube === 0 && i > 6) break; // sem trecho de tubo nas primeiras voltas: não é galho
      if (tube > 0 && (found.length > 1 || len > 1.35 * tube)) {
        junction = level - h / 2;
        // galho de verdade é bem mais fino que o que vem depois (o corpo); uma calota do próprio corpo não é
        let after = len;
        for (let k = 1; k <= 4; k++) {
          const more = isolines(m, dt, level + k * h, undefined, undefined, ix);
          if (more.length > 0) after = Math.max(after, ...more.map((x) => lengthOf(x.pts)));
        }
        if (tube > 0.6 * after) junction = -1;
        break;
      }
      stable = prevLen > 0 && Math.abs(len / prevLen - 1) < 0.12 ? stable + 1 : 0;
      if (stable >= 2 && tube === 0) tube = len;
      prevLen = len;
    }
    // marca a vizinhança da ponta como testada (pontas vizinhas são a mesma ponta)
    for (let v = 0; v < nv; v++) if ((dt[v] as number) < Math.max(2 * h, junction)) covered[v] = 1;
    if (junction < 0) continue;
    const region = new Uint8Array(nv);
    let size = 0;
    for (let v = 0; v < nv; v++)
      if ((dt[v] as number) < junction) {
        region[v] = 1;
        size++;
      }
    if (size > nv / 2) continue; // maior que o resto: é o corpo, não um galho
    arms.push({ tip, field: dt, junction, region });
    if (arms.length >= maxArms) break;
  }
  return arms;
}

/**
 * Receita de uma malha fechada. Cada galho (braço, perna, orelha) vira uma peça própria, feita da ponta (anel mágico) até a
 * emenda e aberta para costurar; o corpo é feito sem os galhos, a partir do ponto mais baixo que sobra, e o laço passa reto
 * por cima de cada emenda. Forma com furo (como uma alça ou um toro) é recusada.
 */
export function fromMesh(
  mesh: Mesh,
  gauge: Gauge,
  options: Partial<ForwardOptions> = {},
): Result<MeshOutput> {
  const o: ForwardOptions = { ...DEFAULTS, ...options };
  const { w, h } = gauge;
  const fail = (code: string, message: string): Result<MeshOutput> => ({
    ok: false,
    issues: [{ code, message, severity: "error" }],
  });
  if (!(w > 0) || !(h > 0))
    return fail("BAD_INPUT", "a largura e a altura do ponto devem ser maiores que zero");
  if (mesh.faces.length < 12) return fail("BAD_INPUT", "a malha tem triângulos de menos");
  if (!closed(mesh))
    return fail("NOT_CLOSED", "a malha não é fechada (tem furos ou bordas soltas): feche no programa 3D");
  const m = refine(mesh, w / 3);
  const nv = m.vertices.length / 3;
  const adj: number[][] = Array.from({ length: nv }, () => []);
  for (let f = 0; f < m.faces.length; f += 3)
    for (let k = 0; k < 3; k++) {
      const a = m.faces[f + k] as number;
      const b = m.faces[f + ((k + 1) % 3)] as number;
      (adj[a] as number[]).push(b);
      (adj[b] as number[]).push(a);
    }
  let low = 0;
  for (let i = 1; i < nv; i++) if (vtx(m, i)[2] < vtx(m, low)[2]) low = i;
  const issues: Issue[] = [];
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

  const arms = findArms(m, geodesic(m, low), adj, h);
  // o corpo: o que sobra sem os galhos, a partir do ponto mais baixo dele
  const bodyOk = new Uint8Array(nv).fill(1);
  for (const a of arms) for (let v = 0; v < nv; v++) if (a.region[v]) bodyOk[v] = 0;
  let seed = -1;
  for (let v = 0; v < nv; v++) if (bodyOk[v] && (seed < 0 || vtx(m, v)[2] < vtx(m, seed)[2])) seed = v;
  if (seed < 0) return fail("TOO_SHORT", "não sobrou corpo depois de separar os galhos");

  /** Voltas de uma peça: laços das isolinhas de `d` (na região `ok`) até `stop` dizer que chegou na emenda. */
  const sweep = (name: string, d: Float64Array, ok: Uint8Array | undefined, stopAt: number) => {
    const reach = Math.max(...Array.from(d).filter((x, v) => Number.isFinite(x) && (!ok || ok[v])));
    const ix = levelIndex(m, d);
    const loops: V3[][] = [];
    const counts: number[] = [];
    for (let i = 1; ; i++) {
      const level = (i - 1 + o.rowPhase) * h;
      if (level >= Math.min(reach, stopAt)) break;
      const found = isolines(m, d, level, ok, undefined, ix);
      if (found.length === 0) break;
      // trechos abertos são o mesmo laço cortado por uma emenda: passa reto por cima dela
      const closedLoops = found.filter((x) => dist(x.pts[0] as V3, x.pts[x.pts.length - 1] as V3) < w);
      const opens = found.filter((x) => !closedLoops.includes(x));
      const cands = [...closedLoops, ...(opens.length > 0 ? [joinOpen(opens)] : [])];
      cands.sort((a, b) => lengthOf(b.pts) - lengthOf(a.pts));
      const main = cands[0] as Iso;
      const side = cands.find((x) => x !== main && lengthOf(x.pts) > 2 * w);
      if (side) {
        const reg = regionAbove(m, adj, d, level, side.above, ok);
        if (reg[main.above])
          return `a forma tem um furo (como uma alça ou um toro) perto da volta ${i} de ${name}: por enquanto não dá para fazer`;
        issues.push({
          code: "BRANCH_SKIPPED",
          message: `${name}, volta ${i}: a forma se divide e uma parte não virou peça (ponta não encontrada); confira o resultado`,
          severity: "warning",
        });
      }
      const ideal = lengthOf(main.pts) / w;
      const prev = counts[counts.length - 1];
      let n: number;
      if (prev === undefined) n = o.startCount ?? clamp(roundCount(ideal), o.startMin, o.startMax);
      else {
        n = clamp(roundCount(ideal), Math.ceil(prev / 2), o.maxIncreasePerStitch * prev);
        if (n !== roundCount(ideal))
          issues.push({
            code: "CLAMPED_ROW",
            message: `${name}, volta ${i}: ${n} pontos em vez de ${roundCount(ideal)} (a forma muda rápido demais)`,
            severity: "warning",
            row: i - 1,
          });
      }
      loops.push(main.pts);
      counts.push(n);
    }
    return { loops, counts };
  };

  /** Receita a partir dos laços: sentido, costura, pontos espaçados e acoplamento entre voltas. */
  const recipe = (loops: V3[][], counts: number[], from: number): Pattern => {
    let axis: V3 = (() => {
      const c = centroid(loops[0] as V3[]);
      const s = vtx(m, from);
      return [c[0] - s[0], c[1] - s[1], c[2] - s[2]];
    })();
    for (const loop of loops) {
      let nrm = normalOf(loop);
      if (dot(nrm, axis) < 0) {
        loop.reverse();
        nrm = [-nrm[0], -nrm[1], -nrm[2]];
      }
      axis = nrm;
    }
    let seam = loops[0]?.[0] as V3;
    const points: V3[][] = loops.map((loop, i) => {
      const p = spread3(loop, counts[i] as number, seam);
      seam = p[0] as V3;
      return p;
    });
    const rows: Row[] = counts.map((n, i) => {
      if (i === 0)
        return {
          label: "1",
          kind: "round",
          start: "magicRing",
          ops: [{ kind: "stitch", code: "SC", count: n }],
          declaredCount: n,
        };
      const P = points[i - 1] as V3[];
      const C = points[i] as V3[];
      const toks = coupleBy(
        P.length,
        C.length,
        (b, a) => dist(C[b] as V3, P[a] as V3) ** 2,
        o.maxIncreasePerStitch,
      );
      return { label: String(i + 1), kind: "round", ops: opsOf(toks), declaredCount: n };
    });
    return { dialect: "pt-BR", rows };
  };

  // corpo
  const dBody = geodesic(m, seed, bodyOk);
  const body = sweep("Corpo", dBody, arms.length > 0 ? bodyOk : undefined, Number.POSITIVE_INFINITY);
  if (typeof body === "string") return fail("HOLE", body);
  {
    let top = 0;
    body.counts.forEach((n, i) => {
      if (n > (body.counts[top] as number)) top = i;
    });
    const end = body.counts.findIndex((n, i) => i > top && n <= o.closeAt);
    if (end >= 0) {
      body.counts.length = end + 1;
      body.loops.length = end + 1;
    }
  }
  if (body.counts.length < 3) return fail("TOO_SHORT", "a peça é curta demais para a altura da volta");
  const pieces: MeshPiece[] = [
    {
      name: "Corpo",
      counts: body.counts,
      pattern: recipe(body.loops, body.counts, seed),
      open: false,
      attachTo: null,
    },
  ];

  // galhos, do mais comprido para o mais curto
  for (const arm of arms) {
    const name = `Parte ${pieces.length + 1}`;
    const s = sweep(name, arm.field, undefined, arm.junction);
    if (typeof s === "string") return fail("HOLE", s);
    if (s.counts.length < 3) {
      issues.push({
        code: "TOO_SHORT",
        message: `um galho ficou com menos de 3 voltas e foi deixado de fora (pequeno demais para a altura da volta)`,
        severity: "warning",
      });
      continue;
    }
    // onde costurar: a volta do corpo na altura da emenda
    let sum = 0;
    let k = 0;
    for (let v = 0; v < nv; v++)
      if (
        !arm.region[v] &&
        (adj[v] as number[]).some((u) => arm.region[u]) &&
        Number.isFinite(dBody[v] as number)
      ) {
        sum += dBody[v] as number;
        k++;
      }
    const near = k > 0 ? sum / k : 0;
    let row = Math.max(1, Math.min(body.counts.length, Math.round(near / h - o.rowPhase + 1)));
    if (!Number.isFinite(row)) row = 1;
    pieces.push({
      name,
      counts: s.counts,
      pattern: recipe(s.loops, s.counts, arm.tip),
      open: true,
      attachTo: { piece: 0, row },
    });
  }
  for (const p of pieces) {
    const v = validate(p.pattern);
    if (!v.ok) return { ok: false, issues: [...v.issues, ...issues] };
  }
  return {
    ok: true,
    value: {
      counts: body.counts,
      pattern: (pieces[0] as MeshPiece).pattern,
      pieces,
      length: Math.max(...Array.from(dBody).filter(Number.isFinite)),
      triangles: m.faces.length / 3,
    },
    issues,
  };
}
