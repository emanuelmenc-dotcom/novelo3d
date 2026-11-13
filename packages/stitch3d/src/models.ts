// SPDX-License-Identifier: GPL-3.0-or-later
// Modelo 3D de cada ponto: poucas polilinhas (arco do topo, haste, voltas extras) viram um tubo (seção de 4, 8 ou 12
// lados conforme a qualidade). Um modelo por variante (tipo, pernas, raio do fio, espelho, tensão, qualidade), gerado
// uma vez e instanciado por ponto com uma matriz (frames.ts) ou deformado por curva (deform.ts). Puro: sem three nem DOM.
import { type StitchTypeDef, stitchType } from "@novelo/core";

export type V3 = [number, number, number];

export interface MeshData {
  /** x, y, z por vértice. */
  positions: Float32Array;
  /** Normais unitárias por vértice (apontam para fora do fio; nas tampas, ao longo do eixo). */
  normals: Float32Array;
  indices: Uint16Array | Uint32Array;
  triangles: number;
  /** Parâmetro por vértice: índice do fio + posição (0 a 1) ao longo dele. */
  param: Float32Array;
}

/** Raios relativos do fio (em larguras de ponto) disponíveis; o modelo usa a faixa mais próxima. */
export const RHO_BANDS = [0.08, 0.12, 0.16, 0.24, 0.34] as const;
export const MAX_LEGS = 4;

/** Opções do modelo (parâmetro, não estado global): o render liga e desliga o fio contínuo para comparar. */
export interface ModelOptions {
  /** Usa os fios próprios do tipo em qualidade ≥ 1 (padrão true). */
  customStrands?: boolean;
  /** Fio relaxado do pb (célula periódica de relaxedScCell): vale só para SC com ≤ 1 perna em qualidade ≥ 1. */
  cell?: V3[];
}

/** Forma do topo de um ponto de base (R3d): quantos filhos trabalham nele e para onde o arco se inclina. */
export interface TopShape {
  /** 0 sem filhos, 1 com um filho, 2 com dois ou mais (aumento). */
  open: 0 | 1 | 2;
  /** Inclinação do arco ao longo do ponto (x do modelo) e para fora (z do modelo). */
  leanX: number;
  leanZ: number;
}
export const NEUTRAL: TopShape = { open: 0, leanX: 0, leanZ: 0 };
export const isNeutral = (s: TopShape | undefined): boolean =>
  !s || (s.open === 0 && s.leanX === 0 && s.leanZ === 0);
/** Lados da seção do tubo por qualidade (0 = edição, 1 = render rápido, 2 = render fino). */
export const SIDES = [4, 8, 12] as const;
/** Níveis de tensão da variante (0 = frouxo ... 8 = firme; 4 = sem tensão). */
export const TENSION_LEVELS = 9;

export interface ModelSpec {
  type: string;
  version: number;
  /** Pernas do ponto: 1 normal, 2 ou mais = diminuição (V). */
  legs: number;
  /** Índice em RHO_BANDS. */
  band: number;
  mirror: boolean;
  /** Nível de tensão, de 0 a 8 (padrão 4). */
  tension: number;
  /** Qualidade da malha, de 0 a 2 (padrão 0). */
  quality: number;
}

export const modelKey = (s: ModelSpec): string =>
  `${s.type}@${s.version}|L${s.legs}|R${s.band}|F${s.mirror ? 1 : 0}|T${s.tension}|Q${s.quality}`;

/** Nível de 0 a 8 de uma tensão de -1 a 1. */
export const tensionLevel = (t: number): number =>
  Math.max(0, Math.min(TENSION_LEVELS - 1, Math.round((t + 1) * 4)));

/**
 * Lê a chave: campos `letra+número` separados por `|`, em qualquer ordem. Chaves antigas (sem T e Q) valem T4 e Q0.
 * Devolve null se faltar tipo, perna, faixa ou espelho, ou se algum valor estiver fora do intervalo.
 */
export function parseModelKey(key: string): ModelSpec | null {
  const parts = key.split("|");
  const head = /^([A-Za-z0-9_]+)@(\d+)$/.exec(parts[0] ?? "");
  if (!head) return null;
  const f: Record<string, number> = {};
  for (const p of parts.slice(1)) {
    const m = /^([A-Z])(\d+)$/.exec(p);
    if (!m || (m[1] as string) in f) return null;
    f[m[1] as string] = Number(m[2]);
  }
  const { L, R, F } = f;
  if (L === undefined || R === undefined || F === undefined) return null;
  const T = f.T ?? 4;
  const Q = f.Q ?? 0;
  if (L < 1 || L > MAX_LEGS || R >= RHO_BANDS.length || F > 1 || T >= TENSION_LEVELS || Q >= SIDES.length) {
    return null;
  }
  for (const k of Object.keys(f)) if (!"LRFTQ".includes(k)) return null;
  return {
    type: head[1] as string,
    version: Number(head[2]),
    legs: L,
    band: R,
    mirror: F === 1,
    tension: T,
    quality: Q,
  };
}

/** Faixa de raio mais próxima de `rho`. */
export function bandOf(rho: number): number {
  let best = 0;
  for (let i = 1; i < RHO_BANDS.length; i++) {
    if (Math.abs((RHO_BANDS[i] as number) - rho) < Math.abs((RHO_BANDS[best] as number) - rho)) best = i;
  }
  return best;
}

export interface Line {
  pts: V3[];
  closed: boolean;
  /** Direção de referência da seção do tubo (estável ao longo de curvas fechadas no plano). */
  up?: V3;
}

interface Strand {
  pts: V3[];
  closed: boolean;
  up?: V3;
  /** Subdivisões Catmull-Rom por trecho. */
  sub: number;
}

/** Curva Catmull-Rom (uniforme) por pontos de controle. */
function catmull(pts: V3[], sub: number, closed: boolean): V3[] {
  if (sub <= 0 || pts.length < 3) return pts;
  const n = pts.length;
  const at = (i: number): V3 =>
    (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]) as V3;
  const out: V3[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, cc: number, d: number) =>
        0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]), c(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  if (!closed) out.push(pts[n - 1] as V3);
  return out;
}

/**
 * Forma do topo aplicada a um fio próprio: só a parte alta (y > -0,5) se desloca, com peso crescente até o topo; o
 * aumento (2 filhos) alarga em x. As pontas e a base ficam onde estão (o fio continua contínuo entre pontos).
 */
function shapeCustom(pts: V3[], sh: TopShape): V3[] {
  return pts.map((p) => {
    const w = Math.max(0, Math.min(1, (p[1] + 0.5) / 0.5));
    const edge = 1 - Math.min(1, Math.abs(p[0]) / 0.5) ** 4; // as pontas E/X (|x| = 0,5) não se movem
    const k = w * edge;
    const wide = sh.open === 2 ? 1 + 0.15 * k : 1;
    return [(p[0] + sh.leanX * k) * wide, p[1], p[2] + (sh.leanZ + 0.04 * sh.open) * k];
  });
}

/** Polilinhas de controle do tipo (espaço do modelo). */
function strandsFor(
  def: StitchTypeDef,
  legs: number,
  shape?: TopShape,
  quality = 0,
  band = 2,
  custom = true,
): Strand[] {
  const m = def.model;
  // fios próprios do tipo (um traço contínuo por ponto), só no render (qualidade ≥ 1): a edição fica com o modelo simples
  // de poucos triângulos. Com mais de uma perna (diminuição em V) o modelo procedural abaixo continua valendo: o fio
  // escrito à mão só descreve o ponto de uma base.
  if (m.strands && m.strands.length > 0 && legs <= 1 && quality >= 1 && custom) {
    const shaped = shape && !isNeutral(shape) ? shape : null;
    // frente e trás da haste precisam ficar a pelo menos 2ρ: em fio grosso o modelo se alarga em z
    const zs = Math.max(1, (RHO_BANDS[band] ?? 0.16) / 0.1);
    return m.strands.map((st) => ({
      pts: (shaped ? shapeCustom(st.pts, shaped) : st.pts).map((p): V3 => [p[0], p[1], p[2] * zs]),
      closed: st.closed === true,
      sub: st.sub ?? 2,
    }));
  }
  if (m.gen === "ring") {
    const pts: V3[] = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return [0.45 * Math.cos(a), -0.5, 0.45 * Math.sin(a)];
    });
    // anel no plano xz: referência fixa em y (a troca automática de referência torcia a seção em dois trechos)
    return [{ pts, closed: true, sub: 0, up: [0, 1, 0] }];
  }
  if (m.gen === "loop") {
    const pts: V3[] = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return [0.5 * Math.cos(a), -0.5 + 0.35 * Math.sin(a), 0.06 * Math.sin(a * 2)];
    });
    return [{ pts, closed: true, sub: 0 }];
  }
  const flat = def.id === "SL";
  const arc: V3[] = flat
    ? [
        [-0.5, -0.5, 0],
        [-0.25, -0.3, 0.05],
        [0, -0.25, 0.08],
        [0.25, -0.3, 0.05],
        [0.5, -0.5, 0],
      ]
    : [
        [-0.5, -0.45, 0],
        [-0.32, -0.12, 0.08],
        [0, 0, 0.12],
        [0.32, -0.12, 0.08],
        [0.5, -0.45, 0],
      ];
  // forma do topo: os três pontos internos do arco (pesos 0,5 / 1 / 0,5) se deslocam e levam o topo das pernas junto
  const shaped = shape && !isNeutral(shape) ? shape : null;
  const lift = (peso: number): V3 =>
    shaped ? [shaped.leanX * peso, 0, (shaped.leanZ + 0.04 * shaped.open) * peso] : [0, 0, 0];
  if (shaped) {
    for (const [i, peso] of [
      [1, 0.5],
      [2, 1],
      [3, 0.5],
    ] as const) {
      const p = arc[i] as V3;
      const d = lift(peso);
      // aumento (2 filhos): o arco também se alarga ao longo do ponto
      const wide = shaped.open === 2 && i !== 2 ? 1.15 : 1;
      arc[i] = [(p[0] + d[0]) * wide, p[1] + d[1], p[2] + d[2]];
    }
  }
  const out: Strand[] = [{ pts: arc, closed: false, sub: flat ? 1 : 2 }];
  const L = Math.max(1, Math.min(MAX_LEGS, legs));
  const topY = flat ? -0.25 : 0;
  for (let k = 0; k < L; k++) {
    const x = L === 1 ? 0 : -0.4 + (0.8 * k) / (L - 1);
    out.push({
      pts: [
        [lift(1)[0], topY, 0.1 + lift(1)[2]],
        [x * 0.5, -0.5, 0.06],
        [x, -1, 0],
      ],
      closed: false,
      sub: flat ? 1 : 2,
    });
  }
  for (let w = 1; w <= m.wraps; w++) {
    const y = -(0.2 + (0.6 * w) / (m.wraps + 1));
    out.push({
      pts: [
        [-0.2, y, 0.06],
        [0.2, y - 0.04, 0.06],
      ],
      closed: false,
      sub: 0,
    });
  }
  return out;
}

/** Linhas centrais do modelo (já subdivididas; mais suaves com a qualidade) e a referência da seção de cada uma. */
export function centerlines(spec: ModelSpec, shape?: TopShape, opts?: ModelOptions): Line[] {
  const def = stitchType(spec.type);
  if (!def) throw new Error(`tipo de ponto '${spec.type}' não existe no registro`);
  return strandsFor(def, spec.legs, shape, spec.quality, spec.band, opts?.customStrands !== false).map(
    (st) => ({
      pts: catmull(st.pts, st.sub > 0 ? st.sub * (1 + spec.quality) : 0, st.closed),
      closed: st.closed,
      ...(st.up ? { up: st.up } : {}),
    }),
  );
}

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Tubo de seção regular (4, 8 ou 12 lados) ao longo das linhas. `rho` é o raio do fio (com 4 lados, o do círculo que
 * circunscreve o quadrado é rho·√2). Tampas planas nas pontas abertas quando `caps` (a malha fica fechada). Espelhado:
 * z invertido e a ordem dos vértices também, para as faces continuarem para fora.
 */
export function extrude(lines: Line[], rho: number, sides: number, mirror: boolean, caps: boolean): MeshData {
  const pos: number[] = [];
  const nor: number[] = [];
  const par: number[] = [];
  const idx: number[] = [];
  const R = sides === 4 ? rho * Math.SQRT2 : rho;
  const zs = mirror ? -1 : 1;
  const wind = (a: number, b: number, c: number) => (mirror ? idx.push(a, c, b) : idx.push(a, b, c));
  lines.forEach((line, li) => {
    const path = line.pts;
    const n = path.length;
    if (n < 2) return;
    const base = pos.length / 3;
    const ends: { t: V3; p: V3 }[] = [];
    for (let i = 0; i < n; i++) {
      const prev = path[line.closed ? (i + n - 1) % n : Math.max(0, i - 1)] as V3;
      const next = path[line.closed ? (i + 1) % n : Math.min(n - 1, i + 1)] as V3;
      const t = norm3(sub3(next, prev));
      let upRef: V3 = Math.abs(t[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
      if (line.up) {
        const u = norm3(line.up);
        // referência paralela à tangente degenera a seção: usa a heurística
        if (Math.abs(u[0] * t[0] + u[1] * t[1] + u[2] * t[2]) < 0.95) upRef = u;
      }
      const n1 = norm3(cross3(t, upRef));
      const n2 = cross3(t, n1);
      const p = path[i] as V3;
      if (i === 0 || i === n - 1) ends.push({ t, p });
      for (let s = 0; s < sides; s++) {
        const a = (2 * Math.PI * (s + 0.5)) / sides;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const d: V3 = [ca * n1[0] + sa * n2[0], ca * n1[1] + sa * n2[1], ca * n1[2] + sa * n2[2]];
        pos.push(p[0] + R * d[0], p[1] + R * d[1], (p[2] + R * d[2]) * zs);
        nor.push(d[0], d[1], d[2] * zs);
        par.push(li + i / (n - 1));
      }
    }
    const segs = line.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = base + i * sides;
      const b = base + ((i + 1) % n) * sides;
      for (let k = 0; k < sides; k++) {
        const k2 = (k + 1) % sides;
        wind(a + k, a + k2, b + k);
        wind(a + k2, b + k2, b + k);
      }
    }
    if (caps && !line.closed && ends.length === 2) {
      const [start, end] = ends as [{ t: V3; p: V3 }, { t: V3; p: V3 }];
      for (const [e, ring, sign] of [
        [start, base, -1],
        [end, base + (n - 1) * sides, 1],
      ] as const) {
        // vértice central e leque; os vértices da borda são cópias (a normal da tampa é a do eixo)
        const c = pos.length / 3;
        pos.push(e.p[0], e.p[1], e.p[2] * zs);
        nor.push(sign * e.t[0], sign * e.t[1], sign * e.t[2] * zs);
        par.push(li + (sign < 0 ? 0 : 1));
        for (let k = 0; k < sides; k++) {
          const k2 = (k + 1) % sides;
          const v1 = pos.length / 3;
          for (const kk of [k, k2]) {
            const src = (ring + kk) * 3;
            pos.push(pos[src] as number, pos[src + 1] as number, pos[src + 2] as number);
            nor.push(sign * e.t[0], sign * e.t[1], sign * e.t[2] * zs);
            par.push(li + (sign < 0 ? 0 : 1));
          }
          if (sign < 0) wind(c, v1 + 1, v1);
          else wind(c, v1, v1 + 1);
        }
      }
    }
  });
  const Index = pos.length / 3 > 65535 ? Uint32Array : Uint16Array;
  return {
    positions: Float32Array.from(pos),
    normals: Float32Array.from(nor),
    indices: Index.from(idx),
    triangles: idx.length / 3,
    param: Float32Array.from(par),
  };
}

/** Cache de modelos por variante: cada chave é gerada uma vez; pode ser invalidada ou sobrescrita (ponto base editado). */
export class ModelCache {
  private readonly meshes = new Map<string, MeshData>();
  /** Quantos modelos foram gerados (para testes e medição). */
  builds = 0;

  get(key: string): MeshData {
    let m = this.meshes.get(key);
    if (!m) {
      const spec = parseModelKey(key);
      if (!spec) throw new Error(`chave de modelo inválida: ${key}`);
      m = extrude(
        centerlines(spec),
        RHO_BANDS[spec.band] ?? RHO_BANDS[2],
        SIDES[spec.quality] ?? 4,
        spec.mirror,
        spec.quality > 0,
      );
      this.meshes.set(key, m);
      this.builds++;
    }
    return m;
  }

  /** Troca o modelo de uma variante (o ponto base editado). */
  set(key: string, mesh: MeshData): void {
    this.meshes.set(key, mesh);
  }

  /** Esquece os modelos cuja chave começa com `prefix` (vazio = todos); serão gerados de novo sob demanda. */
  invalidate(prefix = ""): number {
    let n = 0;
    for (const k of [...this.meshes.keys()]) {
      if (k.startsWith(prefix)) {
        this.meshes.delete(k);
        n++;
      }
    }
    return n;
  }

  has(key: string): boolean {
    return this.meshes.has(key);
  }

  get size(): number {
    return this.meshes.size;
  }
}
