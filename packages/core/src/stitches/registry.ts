// SPDX-License-Identifier: GPL-3.0-or-later
// Registro de tipos de ponto em DADOS (R1): identidade, comprimento de fio, nomes por dialeto e modelo 3D de baixa
// resolução. Os tipos embutidos mantêm a ordem dos índices (Uint8) do armazém de pontos. A janela de criação de pontos
// (R5) acrescentará tipos daqui. As regras de contagem seguem em `simulate.ts` até lá.
import type { Dialect } from "../types.ts";

export type ModelGen = "post" | "loop" | "ring";

/** Polilinha de controle no espaço do modelo (x ∈ [-0,5; 0,5] da entrada à saída, y ∈ [-1; 0] da base ao topo). */
export interface ModelStrand {
  pts: [number, number, number][];
  closed?: boolean;
  /** Subdivisões Catmull-Rom por trecho na qualidade 1 (cresce com a qualidade; padrão 2; 0 = só os pontos dados). */
  sub?: number;
}

export interface StitchModelDef {
  gen: ModelGen;
  /** Voltas extras de fio em torno da haste (meio ponto alto 1, ponto alto 2, ponto alto duplo 3). */
  wraps: number;
  /** Fios de controle próprios (reservado ao criador de pontos; vazio nos embutidos). */
  strands?: ModelStrand[];
}

export interface StitchTypeDef {
  id: string;
  /** Muda quando o modelo muda (entra na chave do cache de geometria). */
  version: number;
  builtin: boolean;
  /** Fio gasto em relação ao ponto baixo (0 = não conta no consumo). */
  lengthFactor: number;
  names: Record<Dialect, string[]>;
  model: StitchModelDef;
}

/**
 * Fio contínuo de um ponto de haste (pb, mpa, pa, pad), em um só traço da entrada E à saída X: desce por trás até o olho
 * da base, sobe pela frente em torno da haste, passa por cima e sai por trás do topo. As laçadas (mpa, pa, pad) são voltas
 * do mesmo fio em torno da haste durante a subida (meia volta elíptica por laçada): um traço só. Escrito à mão (etapa A
 * do criador de pontos; resultado visual negativo, ver docs/15); o criador gerará o mesmo tipo de dado a partir dos comandos.
 */
function postStrands(wraps: number): ModelStrand[] {
  // subida pela frente: sem laçadas é reta; com laçadas o mesmo fio dá meia volta em torno da haste por laçada
  // (o fio que sobe é o mesmo que envolve a haste: um traço só)
  const rise: [number, number, number][] = [];
  if (wraps === 0) {
    rise.push([0.13, -0.82, 0.1], [0.15, -0.5, 0.13], [0.08, -0.18, 0.13]);
  } else {
    const n = 4 * wraps;
    const cx = 0.03;
    const R = 0.13;
    const th0 = 0.7;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const th = th0 - Math.PI * wraps * t;
      rise.push([cx + R * Math.cos(th), -0.82 + 0.64 * t, 0.6 * R * Math.sin(th) + 0.02]);
    }
  }
  return [
    {
      pts: [
        [-0.5, -0.45, 0],
        [-0.38, -0.6, -0.06],
        [-0.18, -0.85, -0.09],
        [0, -1, -0.02],
        ...rise,
        [0, -0.03, 0.1],
        [0.2, -0.08, -0.05],
        [0.38, -0.27, -0.03],
        [0.5, -0.45, 0],
      ],
      sub: 2,
    },
  ];
}

const names = (pt: string, us: string, uk: string): Record<Dialect, string[]> => ({
  "pt-BR": [pt],
  "en-US": [us],
  "en-UK": [uk],
});

/** Tipos embutidos, na ordem dos índices do armazém: RING, CH, SL, SC, HDC, DC, TR. */
export const STITCH_TYPES: StitchTypeDef[] = [
  {
    id: "RING",
    version: 1,
    builtin: true,
    lengthFactor: 0,
    names: names("anel", "ring", "ring"),
    model: { gen: "ring", wraps: 0 },
  },
  {
    id: "CH",
    version: 1,
    builtin: true,
    lengthFactor: 0.8,
    names: names("corr", "ch", "ch"),
    model: { gen: "loop", wraps: 0 },
  },
  {
    id: "SL",
    version: 1,
    builtin: true,
    lengthFactor: 0.4,
    names: names("pbx", "sl st", "sl st"),
    model: { gen: "post", wraps: 0 },
  },
  {
    id: "SC",
    version: 1,
    builtin: true,
    lengthFactor: 1,
    names: names("pb", "sc", "dc"),
    model: { gen: "post", wraps: 0, strands: postStrands(0) },
  },
  {
    id: "HDC",
    version: 1,
    builtin: true,
    lengthFactor: 1.33,
    names: names("mpa", "hdc", "htr"),
    model: { gen: "post", wraps: 1, strands: postStrands(1) },
  },
  {
    id: "DC",
    version: 1,
    builtin: true,
    lengthFactor: 2,
    names: names("pa", "dc", "tr"),
    model: { gen: "post", wraps: 2, strands: postStrands(2) },
  },
  {
    id: "TR",
    version: 1,
    builtin: true,
    lengthFactor: 3,
    names: names("pad", "tr", "dtr"),
    model: { gen: "post", wraps: 3, strands: postStrands(3) },
  },
];

export const BUILTIN_CODES: readonly string[] = STITCH_TYPES.map((t) => t.id);

export const stitchType = (id: string): StitchTypeDef | undefined => STITCH_TYPES.find((t) => t.id === id);
