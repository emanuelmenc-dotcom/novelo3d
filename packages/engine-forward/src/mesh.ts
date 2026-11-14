// SPDX-License-Identifier: GPL-3.0-or-later
// Malha livre -> receita, rota A (P5d, protótipo; docs/08 seção 3): distância geodésica a partir de uma semente, voltas
// nas isolinhas a cada altura de volta, contagem pelo comprimento do laço e acoplamento no espaço. Reimplementado a partir
// do artigo do AmiGo, sem código do repositório dele (licença não comercial). Só peças sem ramificação: onde uma isolinha
// vira dois laços, o motor para e avisa (dividir em peças fica para depois).
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

/** Distância geodésica aproximada (Dijkstra pelas arestas) de cada vértice até a semente. */
function geodesic(m: Mesh, seed: number): Float64Array {
  const n = m.vertices.length / 3;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let f = 0; f < m.faces.length; f += 3)
    for (let k = 0; k < 3; k++) {
      const a = m.faces[f + k] as number;
      const b = m.faces[f + ((k + 1) % 3)] as number;
      (adj[a] as number[]).push(b);
      (adj[b] as number[]).push(a);
    }
  const d = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  d[seed] = 0;
  // fila de prioridade (heap binário) de [distância, vértice]
  const heap: [number, number][] = [[0, seed]];
  const push = (x: [number, number]) => {
    heap.push(x);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((heap[p] as [number, number])[0] <= x[0]) break;
      heap[i] = heap[p] as [number, number];
      i = p;
    }
    heap[i] = x;
  };
  const key = (i: number) => (heap[i] as [number, number])[0];
  const pop = (): [number, number] => {
    const top = heap[0] as [number, number];
    const last = heap.pop() as [number, number];
    if (heap.length === 0) return top;
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let s = i;
      if (l < heap.length && key(l) < key(s)) s = l;
      if (r < heap.length && key(r) < key(s)) s = r;
      if (s === i) break;
      const t = heap[i] as [number, number];
      heap[i] = heap[s] as [number, number];
      heap[s] = t;
      i = s;
    }
    return top;
  };
  while (heap.length > 0) {
    const [du, u] = pop();
    if (du > (d[u] as number)) continue;
    const pu = vtx(m, u);
    for (const v of adj[u] as number[]) {
      const nd = du + dist(pu, vtx(m, v));
      if (nd < (d[v] as number)) {
        d[v] = nd;
        push([nd, v]);
      }
    }
  }
  return d;
}

/** Laços da isolinha de nível `level`: cada um é uma lista fechada de pontos. */
function isolines(m: Mesh, d: Float64Array, level: number): V3[][] {
  const pt = new Map<string, V3>();
  const links = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!links.has(a)) links.set(a, []);
    if (!links.has(b)) links.set(b, []);
    (links.get(a) as string[]).push(b);
    (links.get(b) as string[]).push(a);
  };
  for (let f = 0; f < m.faces.length; f += 3) {
    const hits: string[] = [];
    for (let k = 0; k < 3; k++) {
      const a = m.faces[f + k] as number;
      const b = m.faces[f + ((k + 1) % 3)] as number;
      const da = d[a] as number;
      const db = d[b] as number;
      // cruza a aresta: um lado abaixo do nível e o outro acima (o "igual" fica do lado de baixo, sem ponto repetido)
      if (da <= level !== db <= level) {
        const key = edgeKey(a, b);
        if (!pt.has(key)) {
          const t = (level - da) / (db - da);
          const p = vtx(m, a);
          const q = vtx(m, b);
          pt.set(key, [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
        }
        hits.push(key);
      }
    }
    if (hits.length === 2) link(hits[0] as string, hits[1] as string);
  }
  const seen = new Set<string>();
  const loops: V3[][] = [];
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const loop: V3[] = [];
    let prev = "";
    let cur = start;
    while (!seen.has(cur)) {
      seen.add(cur);
      loop.push(pt.get(cur) as V3);
      const next = (links.get(cur) as string[]).find((x) => x !== prev && !seen.has(x));
      if (!next) break;
      prev = cur;
      cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
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

export interface MeshOutput {
  counts: number[];
  pattern: Pattern;
  /** Comprimento geodésico da semente ao ponto mais longe (mm). */
  length: number;
  triangles: number;
}

/** Receita de uma malha fechada sem ramificação. A semente é o vértice mais baixo (menor z), onde fica o anel mágico. */
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
  let seed = 0;
  for (let i = 1; i < m.vertices.length / 3; i++) if (vtx(m, i)[2] < vtx(m, seed)[2]) seed = i;
  const d = geodesic(m, seed);
  const far = Math.max(...Array.from(d).filter(Number.isFinite));
  const issues: Issue[] = [];
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

  const loops: V3[][] = [];
  const counts: number[] = [];
  for (let i = 1; ; i++) {
    const level = (i - 1 + o.rowPhase) * h;
    if (level >= far) break;
    const found = isolines(m, d, level);
    if (found.length === 0) break;
    if (found.length > 1)
      return {
        ok: false,
        issues: [
          {
            code: "BRANCHES",
            message: `a forma se divide em ${found.length} partes na volta ${i} (como braços ou pernas): por enquanto só peças sem ramificação; faça cada parte como uma peça`,
            severity: "error",
          },
        ],
      };
    const loop = found[0] as V3[];
    const ideal = lengthOf(loop) / w;
    const prev = counts[counts.length - 1];
    let n: number;
    if (prev === undefined) n = o.startCount ?? clamp(roundCount(ideal), o.startMin, o.startMax);
    else {
      n = clamp(roundCount(ideal), Math.ceil(prev / 2), o.maxIncreasePerStitch * prev);
      if (n !== roundCount(ideal))
        issues.push({
          code: "CLAMPED_ROW",
          message: `volta ${i}: ${n} pontos em vez de ${roundCount(ideal)} (a forma muda rápido demais)`,
          severity: "warning",
          row: i - 1,
        });
    }
    loops.push(loop);
    counts.push(n);
  }
  // fecha: termina na primeira volta, depois do maior total, com até `closeAt` pontos
  let top = 0;
  counts.forEach((n, i) => {
    if (n > (counts[top] as number)) top = i;
  });
  const end = counts.findIndex((n, i) => i > top && n <= o.closeAt);
  if (end >= 0) {
    counts.length = end + 1;
    loops.length = end + 1;
  }
  if (counts.length < 3) return fail("TOO_SHORT", "a peça é curta demais para a altura da volta");

  // sentido: todos os laços giram para o mesmo lado (normal no sentido do avanço, de volta a volta)
  let axis: V3 = (() => {
    const c = centroid(loops[0] as V3[]);
    const s = vtx(m, seed);
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

  // costura: começa perto do começo da volta anterior; pontos espaçados por igual em cada laço
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
  const pattern: Pattern = { dialect: "pt-BR", rows };
  const v = validate(pattern);
  if (!v.ok) return { ok: false, issues: [...v.issues, ...issues] };
  return { ok: true, value: { counts, pattern, length: far, triangles: m.faces.length / 3 }, issues };
}
