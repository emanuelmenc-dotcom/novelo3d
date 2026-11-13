// SPDX-License-Identifier: GPL-3.0-or-later
// Fios e pintura (docs/06 seção 8, adaptada ao P3). A pintura vive no grafo, em coordenadas topológicas (volta e
// posição na volta), nunca em posições 3D: por isso não muda quando o layout, a escala ou a amostra mudam.
import { STITCH_TYPES } from "./stitches/registry.ts";
import type { Issue, StitchGraph } from "./types.ts";
import {
  type ColorSpec,
  type MaterialId,
  type Thickness,
  validateColorSpec,
  validateMaterial,
  validateThickness,
} from "./yarnlib.ts";

export interface Yarn {
  /** Letra de A a Z. */
  id: string;
  name: string;
  /** Cor base (#rrggbb); com cor não lisa é a primeira cor da lista. */
  colorHex: string;
  /** Cor não lisa (listras, degradê, mescla, jaspê) por comprimento de fio gasto. */
  color?: ColorSpec;
  material?: MaterialId;
  thickness?: Thickness;
}

/** Cores de exemplo do projeto (D-16): A verde musgo, B off white. */
export const DEFAULT_YARNS: Yarn[] = [
  { id: "A", name: "verde musgo", colorHex: "#5d6b3a" },
  { id: "B", name: "off white", colorHex: "#f4f1e8" },
];

export const BASE_YARN = "A";
export const MAX_YARNS = 8;

/** Regiões: voltas de `from` a `to` (1-based, já expandidas) ou pontos soltos `(volta, posição)`. Regiões mais
 * abaixo na lista têm prioridade. */
export type PaintRegion =
  | { kind: "rows"; yarn: string; from: number; to: number }
  | { kind: "stitches"; yarn: string; at: { row: number; index: number }[] };

const HEX = /^#[0-9a-f]{6}$/i;

export function validateYarns(input: unknown): Yarn[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_YARNS) {
    throw new Error(`a paleta deve ter de 1 a ${MAX_YARNS} fios`);
  }
  const ids = new Set<string>();
  const out: Yarn[] = input.map((y, i) => {
    const o = y as Partial<Yarn> | null;
    if (!o || typeof o.id !== "string" || !/^[A-Z]$/.test(o.id)) {
      throw new Error(`fio ${i + 1}: o id deve ser uma letra de A a Z`);
    }
    if (ids.has(o.id)) throw new Error(`fio '${o.id}' repetido`);
    ids.add(o.id);
    if (typeof o.name !== "string" || o.name.trim() === "" || o.name.length > 40) {
      throw new Error(`fio ${o.id}: o nome deve ter de 1 a 40 caracteres`);
    }
    if (typeof o.colorHex !== "string" || !HEX.test(o.colorHex)) {
      throw new Error(`fio ${o.id}: a cor deve ser do tipo #rrggbb`);
    }
    const color = validateColorSpec((o as { color?: unknown }).color, o.id);
    const material = validateMaterial((o as { material?: unknown }).material, o.id);
    const thickness = validateThickness((o as { thickness?: unknown }).thickness, o.id);
    const yarn: Yarn = {
      id: o.id,
      name: o.name.trim(),
      colorHex: (color?.colors[0] ?? o.colorHex).toLowerCase(),
    };
    if (color) yarn.color = color;
    if (material) yarn.material = material;
    if (thickness) yarn.thickness = thickness;
    return yarn;
  });
  if (!ids.has(BASE_YARN)) throw new Error(`a paleta precisa do fio ${BASE_YARN} (fio base)`);
  return out;
}

export function validateRegion(input: unknown, yarns: Yarn[]): PaintRegion {
  const o = input as Record<string, unknown> | null;
  if (!o || typeof o !== "object") throw new Error("região de pintura inválida");
  if (typeof o.yarn !== "string" || !yarns.some((y) => y.id === o.yarn)) {
    throw new Error(`fio '${String(o.yarn)}' não existe na paleta`);
  }
  if (o.kind === "rows") {
    const { from, to } = o as { from?: unknown; to?: unknown };
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      (from as number) < 1 ||
      (to as number) < (from as number)
    ) {
      throw new Error("faixa de voltas inválida: use números inteiros com 1 <= de <= até");
    }
    return { kind: "rows", yarn: o.yarn, from: from as number, to: to as number };
  }
  if (o.kind === "stitches") {
    const at = o.at;
    if (!Array.isArray(at) || at.length === 0) throw new Error("informe ao menos um ponto");
    const pts = at.map((p) => {
      const q = p as { row?: unknown; index?: unknown };
      if (
        !Number.isInteger(q.row) ||
        (q.row as number) < 1 ||
        !Number.isInteger(q.index) ||
        (q.index as number) < 0
      ) {
        throw new Error("ponto inválido: volta (de 1) e posição (de 0) devem ser inteiros");
      }
      return { row: q.row as number, index: q.index as number };
    });
    return { kind: "stitches", yarn: o.yarn, at: pts };
  }
  throw new Error(`tipo de região '${String(o.kind)}' desconhecido (use rows ou stitches)`);
}

/** Avisos sobre pintura que não encontra o que pintar (a receita mudou): a região é ignorada, nunca apagada. */
export function paintIssues(graph: StitchGraph, regions: PaintRegion[], yarns: Yarn[]): Issue[] {
  const issues: Issue[] = [];
  const rounds = graph.rows.length;
  regions.forEach((r, i) => {
    if (!yarns.some((y) => y.id === r.yarn)) {
      issues.push({
        code: "PAINT_UNKNOWN_YARN",
        severity: "warning",
        message: `Pintura ${i + 1}: o fio ${r.yarn} não está na paleta.`,
      });
    }
    if (r.kind === "rows") {
      if (r.to > rounds) {
        issues.push({
          code: "PAINT_OUT_OF_RANGE",
          severity: "warning",
          message: `Pintura ${i + 1}: voltas ${r.from}–${r.to}, mas a receita só tem ${rounds} voltas.`,
        });
      }
    } else {
      for (const p of r.at) {
        const row = graph.rows[p.row - 1];
        if (!row || p.index > row.last - row.first) {
          issues.push({
            code: "PAINT_OUT_OF_RANGE",
            severity: "warning",
            message: `Pintura ${i + 1}: ponto ${p.index + 1} da volta ${p.row} não existe na receita.`,
          });
          break;
        }
      }
    }
  });
  return issues;
}

/** Fio de cada nó (indexado pelo id do nó). Começa no fio da própria receita (ou `base`) e aplica as regiões em ordem. */
export function paintedYarns(graph: StitchGraph, regions: PaintRegion[], base: string = BASE_YARN): string[] {
  const out = graph.nodes.map((n) => n.yarnId || base);
  const at = new Map<string, number>();
  for (const n of graph.nodes) if (n.rowIndex >= 0) at.set(`${n.rowIndex + 1}:${n.indexInRow}`, n.id);
  for (const r of regions) {
    if (r.kind === "rows") {
      for (const n of graph.nodes) {
        if (n.rowIndex >= 0 && n.rowIndex + 1 >= r.from && n.rowIndex + 1 <= r.to) out[n.id] = r.yarn;
      }
    } else {
      for (const p of r.at) {
        const id = at.get(`${p.row}:${p.index}`);
        if (id !== undefined) out[id] = r.yarn;
      }
    }
  }
  // o nó do anel acompanha o primeiro ponto
  const ring = graph.nodes.find((n) => n.rowIndex < 0);
  const firstStitch = graph.nodes.find((n) => n.rowIndex === 0);
  if (ring && firstStitch) out[ring.id] = out[firstStitch.id] as string;
  return out;
}

/** Cópia do grafo com o fio de cada ponto já resolvido. */
export function applyPaint(
  graph: StitchGraph,
  regions: PaintRegion[],
  base: string = BASE_YARN,
): StitchGraph {
  const yarns = paintedYarns(graph, regions, base);
  return { ...graph, nodes: graph.nodes.map((n) => ({ ...n, yarnId: yarns[n.id] as string })) };
}

/** Quantas vezes o fio muda ao longo do trabalho (ordem dos pontos, sem contar o anel). */
export function countYarnChanges(graph: StitchGraph): number {
  let changes = 0;
  let last: string | undefined;
  for (const n of graph.nodes) {
    if (n.rowIndex < 0) continue;
    if (last !== undefined && n.yarnId !== last) changes++;
    last = n.yarnId;
  }
  return changes;
}

/** Comprimento de fio de cada ponto em relação ao ponto baixo (estimativa; calibrar com amostras, risco R-01). */
export const STITCH_LENGTH_FACTOR: Record<string, number> = Object.fromEntries(
  STITCH_TYPES.filter((t) => t.lengthFactor > 0).map((t) => [t.id, t.lengthFactor]),
);
/** Fio gasto por ponto baixo, em múltiplos da largura do ponto. */
export const SC_LENGTH_PER_WIDTH = 4.2;

export interface YarnUsage {
  yarn: string;
  /** Pontos contados nesse fio. */
  stitches: number;
  /** Comprimento estimado, em mm. */
  lengthMm: number;
  /** Parte do total, de 0 a 1. */
  share: number;
}

/** Consumo estimado por fio. `stitchWidthMm` é a largura do ponto (100 / pontos em 10 cm). */
export function yarnUsage(
  graph: StitchGraph,
  stitchWidthMm = 5,
  /** Multiplicador da largura do ponto por fio (espessura do fio em relação ao de referência). */
  widthOf: (yarn: string) => number = () => 1,
  /** Tamanho relativo de cada ponto (tensão): ponto maior gasta mais fio. */
  sizeOf: (nodeId: number) => number = () => 1,
): YarnUsage[] {
  const per = new Map<string, { stitches: number; lengthMm: number }>();
  let total = 0;
  for (const n of graph.nodes) {
    if (n.rowIndex < 0) continue;
    const len =
      (STITCH_LENGTH_FACTOR[n.code] ?? 1) *
      SC_LENGTH_PER_WIDTH *
      stitchWidthMm *
      widthOf(n.yarnId) *
      sizeOf(n.id);
    const cur = per.get(n.yarnId) ?? { stitches: 0, lengthMm: 0 };
    if (n.counted) cur.stitches++;
    cur.lengthMm += len;
    per.set(n.yarnId, cur);
    total += len;
  }
  return [...per.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([yarn, v]) => ({
      yarn,
      stitches: v.stitches,
      lengthMm: v.lengthMm,
      share: total > 0 ? v.lengthMm / total : 0,
    }));
}

/**
 * Comprimento de fio já gasto, no meio de cada ponto, contado por fio (indexado pelo id do nó; o anel vale 0).
 * Alimenta a cor por comprimento (listras, degradê, mescla) e usa a mesma conta do consumo.
 */
export function yarnCursor(
  graph: StitchGraph,
  stitchWidthMm = 5,
  widthOf: (yarn: string) => number = () => 1,
  sizeOf: (nodeId: number) => number = () => 1,
): Float64Array {
  const out = new Float64Array(graph.nodes.length);
  const used = new Map<string, number>();
  for (const n of graph.nodes) {
    if (n.rowIndex < 0) continue;
    const len =
      (STITCH_LENGTH_FACTOR[n.code] ?? 1) *
      SC_LENGTH_PER_WIDTH *
      stitchWidthMm *
      widthOf(n.yarnId) *
      sizeOf(n.id);
    const before = used.get(n.yarnId) ?? 0;
    out[n.id] = before + len / 2;
    used.set(n.yarnId, before + len);
  }
  return out;
}
