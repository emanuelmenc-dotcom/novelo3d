// SPDX-License-Identifier: GPL-3.0-or-later
// Biblioteca de fios (P3.5, D-37): cor em vários modos (por comprimento de fio gasto), material, espessura por padrão
// de mercado (EUA, Reino Unido/Europa, Brasil) e as funções puras que as usam. Valores de mercado são APROXIMADOS:
// variam por marca e lote; sempre confirme no rótulo e calibre com uma amostra.
import type { Yarn } from "./paint.ts";

// ------------------------------------------------------------------ cor

export const COLOR_KINDS = ["solid", "stripes", "gradient", "melange", "tweed"] as const;
export type ColorKind = (typeof COLOR_KINDS)[number];

export const COLOR_KIND_NAMES: Record<ColorKind, string> = {
  solid: "Cor lisa",
  stripes: "Listras (muda a cada trecho)",
  gradient: "Degradê (ombré)",
  melange: "Mescla (trechos curtos misturados)",
  tweed: "Jaspê / tweed (pintinhas)",
};

export interface ColorSpec {
  kind: ColorKind;
  /** De 1 a 6 cores #rrggbb. */
  colors: string[];
  /** Comprimento de cada trecho de cor, em metros de fio (listras, degradê, mescla). */
  segmentM?: number;
}

export const DEFAULT_SEGMENT_M: Record<ColorKind, number> = {
  solid: 1,
  stripes: 8,
  gradient: 15,
  melange: 0.4,
  tweed: 1,
};

// ------------------------------------------------------------------ material

export const MATERIAL_IDS = ["acrilico", "algodao", "la", "mohair", "chenille", "amigurumi"] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];

export interface MaterialInfo {
  id: MaterialId;
  name: string;
  /** Variação aleatória de brilho por ponto (aparência de fibra), de 0 a 1. */
  jitter: number;
  /** Volume extra do ponto no 3D (felpa). */
  fuzz: number;
  note: string;
}

export const MATERIALS: MaterialInfo[] = [
  { id: "acrilico", name: "Acrílico", jitter: 0.02, fuzz: 1, note: "Liso, pouco brilho de fibra." },
  { id: "algodao", name: "Algodão", jitter: 0.05, fuzz: 1, note: "Fosco, ponto bem definido." },
  { id: "la", name: "Lã", jitter: 0.09, fuzz: 1.05, note: "Fibra visível, leve volume." },
  { id: "mohair", name: "Mohair", jitter: 0.14, fuzz: 1.14, note: "Felpudo: pontos mais volumosos." },
  { id: "chenille", name: "Chenille", jitter: 0.1, fuzz: 1.1, note: "Veludo: volume e brilho irregular." },
  { id: "amigurumi", name: "Fio para amigurumi", jitter: 0.03, fuzz: 1, note: "Firme e liso, ponto nítido." },
];
export const materialById = (id: string | undefined): MaterialInfo | undefined =>
  MATERIALS.find((m) => m.id === id);

// ------------------------------------------------------------------ espessura (valores aproximados)

export type Region = "eua" | "uk-eu" | "br" | "custom";
export const REGION_NAMES: Record<Region, string> = {
  eua: "EUA (Craft Yarn Council, 0–7)",
  "uk-eu": "Reino Unido / Europa (ply, DK, Aran)",
  br: "Brasil (categorias comerciais)",
  custom: "Personalizada",
};

export interface ThicknessInfo {
  id: string;
  region: Exclude<Region, "custom">;
  name: string;
  /** Diâmetro aproximado do fio, em mm. */
  diameterMm: number;
  /** Metros por 100 g (aproximado). */
  mPer100g: number;
  /** Agulha de crochê indicada, em mm [mín, máx]. */
  hookMm: [number, number];
  /** Pontos baixos em 10 cm (aproximado), [mín, máx]. */
  stsPer10cm: [number, number];
}

const t = (
  id: string,
  region: ThicknessInfo["region"],
  name: string,
  diameterMm: number,
  mPer100g: number,
  hookMm: [number, number],
  stsPer10cm: [number, number],
): ThicknessInfo => ({ id, region, name, diameterMm, mPer100g, hookMm, stsPer10cm });

export const THICKNESS: ThicknessInfo[] = [
  t("cyc-0", "eua", "0 · Lace (renda)", 0.5, 600, [1.6, 2.25], [32, 42]),
  t("cyc-1", "eua", "1 · Super Fine", 1, 400, [2.25, 3.5], [21, 32]),
  t("cyc-2", "eua", "2 · Fine", 1.4, 300, [3.5, 4.5], [16, 20]),
  t("cyc-3", "eua", "3 · Light", 2, 230, [4.5, 5.5], [12, 17]),
  t("cyc-4", "eua", "4 · Medium", 2.5, 180, [5.5, 6.5], [11, 14]),
  t("cyc-5", "eua", "5 · Bulky", 3.5, 120, [6.5, 9], [8, 11]),
  t("cyc-6", "eua", "6 · Super Bulky", 5, 70, [9, 15], [7, 9]),
  t("cyc-7", "eua", "7 · Jumbo", 8, 40, [15, 25], [4, 6]),
  t("uk-2ply", "uk-eu", "2 ply (lace)", 0.6, 600, [1.5, 2.5], [30, 40]),
  t("uk-3ply", "uk-eu", "3 ply", 0.9, 450, [2, 3], [24, 32]),
  t("uk-4ply", "uk-eu", "4 ply (sock / fingering)", 1.1, 380, [2.5, 3.5], [20, 28]),
  t("uk-dk", "uk-eu", "DK (double knit)", 2, 230, [4, 5], [14, 18]),
  t("uk-aran", "uk-eu", "Aran", 2.6, 180, [5, 6], [11, 14]),
  t("uk-chunky", "uk-eu", "Chunky", 3.8, 110, [6.5, 8], [8, 11]),
  t("uk-superchunky", "uk-eu", "Super chunky", 5.5, 65, [9, 12], [6, 8]),
  t("br-linha10", "br", "Linha fina (nº 10 / tipo Anne)", 0.5, 800, [1.25, 2], [30, 42]),
  t("br-acrilico-fino", "br", "Fio acrílico fino (tipo baby)", 1.2, 380, [2.5, 3.5], [20, 28]),
  t("br-amigurumi", "br", "Fio para amigurumi", 1.6, 300, [2, 3], [18, 26]),
  t("br-barbante-4-4", "br", "Barbante 4/4", 1.8, 220, [2.5, 3.5], [16, 22]),
  t("br-barbante-4-6", "br", "Barbante 4/6", 2.4, 150, [3, 4], [13, 18]),
  t("br-barbante-4-8", "br", "Barbante 4/8", 3, 110, [4, 5], [10, 14]),
  t("br-malha", "br", "Fio de malha (trapilho)", 6, 55, [8, 12], [6, 8]),
];
export const thicknessById = (id: string | undefined): ThicknessInfo | undefined =>
  THICKNESS.find((x) => x.id === id);

export interface Thickness {
  /** Padrão da tabela (`cyc-3`, `uk-dk`, `br-amigurumi`...) ou ausente para valor personalizado. */
  id?: string;
  /** Diâmetro em mm (da tabela ou digitado). */
  diameterMm: number;
}

/** Diâmetro de referência quando o fio não informa espessura: o de um fio "Light/DK" (2 mm). */
export const REF_DIAMETER_MM = 2;

/** Quantas vezes o ponto desse fio é mais largo que o do fio de referência (limitado a 0,4–3). */
export function thicknessRatio(y: Yarn | undefined, ref: Yarn | undefined): number {
  const d = y?.thickness?.diameterMm ?? REF_DIAMETER_MM;
  const r = ref?.thickness?.diameterMm ?? REF_DIAMETER_MM;
  return Math.max(0.4, Math.min(3, d / r));
}

// ------------------------------------------------------------------ validação (chamada por validateYarns)

const HEX = /^#[0-9a-f]{6}$/i;

export function validateColorSpec(input: unknown, id: string): ColorSpec | undefined {
  if (input === undefined || input === null) return undefined;
  const o = input as Partial<ColorSpec>;
  if (typeof o !== "object" || !(COLOR_KINDS as readonly string[]).includes(o.kind as string)) {
    throw new Error(`fio ${id}: tipo de cor deve ser ${COLOR_KINDS.join(", ")}`);
  }
  if (!Array.isArray(o.colors) || o.colors.length < 1 || o.colors.length > 6) {
    throw new Error(`fio ${id}: informe de 1 a 6 cores`);
  }
  const colors = o.colors.map((c) => {
    if (typeof c !== "string" || !HEX.test(c))
      throw new Error(`fio ${id}: cada cor deve ser do tipo #rrggbb`);
    return c.toLowerCase();
  });
  const out: ColorSpec = { kind: o.kind as ColorKind, colors };
  if (o.segmentM !== undefined) {
    if (typeof o.segmentM !== "number" || !(o.segmentM >= 0.05 && o.segmentM <= 500)) {
      throw new Error(`fio ${id}: o trecho de cor deve ficar entre 0,05 e 500 metros`);
    }
    out.segmentM = o.segmentM;
  }
  return out.kind === "solid" ? undefined : out;
}

export function validateMaterial(input: unknown, id: string): MaterialId | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== "string" || !(MATERIAL_IDS as readonly string[]).includes(input)) {
    throw new Error(`fio ${id}: material deve ser ${MATERIAL_IDS.join(", ")}`);
  }
  return input as MaterialId;
}

export function validateThickness(input: unknown, id: string): Thickness | undefined {
  if (input === undefined || input === null) return undefined;
  const o = input as Partial<Thickness>;
  if (typeof o !== "object") throw new Error(`fio ${id}: espessura inválida`);
  if (o.id !== undefined) {
    const info = thicknessById(o.id);
    if (!info) throw new Error(`fio ${id}: padrão de espessura '${String(o.id)}' desconhecido`);
    return { id: info.id, diameterMm: typeof o.diameterMm === "number" ? o.diameterMm : info.diameterMm };
  }
  if (typeof o.diameterMm !== "number" || !(o.diameterMm >= 0.2 && o.diameterMm <= 20)) {
    throw new Error(`fio ${id}: o diâmetro deve ficar entre 0,2 e 20 mm`);
  }
  return { diameterMm: o.diameterMm };
}

// ------------------------------------------------------------------ cor por comprimento de fio gasto

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];
const toHex = (c: Rgb): string =>
  `#${c
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
const mix = (a: Rgb, b: Rgb, f: number): Rgb => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
  a[2] + (b[2] - a[2]) * f,
];

/** Número pseudoaleatório estável em [0, 1) a partir de um inteiro. */
export function hash01(n: number): number {
  let x = Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/**
 * Cor do fio no ponto em que já foram gastos `lengthMm` desse fio. `key` (o uid do ponto) dá a variação estável
 * de fibra e as pintinhas do jaspê. Mesmo fio + mesmo comprimento + mesmo ponto = mesma cor.
 */
export function yarnColorAt(y: Yarn, lengthMm: number, key = 0): string {
  const spec = y.color;
  const base = toRgb(y.colorHex);
  let c: Rgb = base;
  if (spec && spec.colors.length > 0) {
    const cols = spec.colors.map(toRgb);
    const n = cols.length;
    const seg = (spec.segmentM ?? DEFAULT_SEGMENT_M[spec.kind]) * 1000;
    const pos = Math.max(0, lengthMm) / seg;
    const at = (i: number) => cols[((i % n) + n) % n] as Rgb;
    if (spec.kind === "stripes") c = at(Math.floor(pos));
    else if (spec.kind === "gradient") {
      const i = Math.floor(pos);
      const f = pos - i;
      c = mix(at(i), at(i + 1), f * f * (3 - 2 * f));
    } else if (spec.kind === "melange") {
      const i = Math.floor(pos);
      const pick = (k: number) => at(Math.floor(hash01(k * 7919 + 13) * n));
      c = mix(pick(i), pick(i + 1), pos - i);
    } else if (spec.kind === "tweed") {
      c = at(0);
      if (n > 1 && hash01(key * 31 + 7) < 0.22) {
        c = mix(c, at(1 + Math.floor(hash01(key * 17 + 3) * (n - 1))), 0.85);
      }
    }
  }
  const mat = materialById(y.material);
  if (mat && mat.jitter > 0) {
    const k = 1 + (hash01(key * 131 + 5) - 0.5) * 2 * mat.jitter;
    c = [c[0] * k, c[1] * k, c[2] * k];
  }
  return toHex(c);
}
