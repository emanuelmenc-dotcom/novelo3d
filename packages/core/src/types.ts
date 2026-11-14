// SPDX-License-Identifier: GPL-3.0-or-later
// Tipos da receita e do grafo de pontos (docs/06-modelo-de-dados.md, revisados no P1).

export interface Issue {
  code: string;
  message: string;
  severity?: "error" | "warning";
  /** Índice (base 0) da linha da receita, quando aplicável. */
  row?: number;
}

export type Result<T> = { ok: true; value: T; issues: Issue[] } | { ok: false; issues: Issue[] };

export type StitchCode = "CH" | "SL" | "SC" | "HDC" | "DC" | "TR";
/** `xva`: notação de letras (X pb, V aumento, A diminuição, T mpa, F pa, E pad), mistura com os termos de en-US. */
export type Dialect = "pt-BR" | "en-US" | "en-UK" | "xva";
/** Número de pontos, ou "rest": todos os topos contados que ainda restam na volta anterior. */
export type Count = number | "rest";

/** Desvio do doc 06: `group` virou `inc`/`dec` explícitos (mais simples de validar e imprimir). */
export type Op =
  | { kind: "stitch"; code: StitchCode; count: Count; counted?: boolean }
  | { kind: "inc"; k: number; count: Count }
  | { kind: "dec"; k: number; count: number }
  | { kind: "repeat"; times: number; ops: Op[] }
  | { kind: "skip"; count: Count }
  | { kind: "slInto"; count: number } // ponto baixíssimo em corrente não contada
  | { kind: "join" } // ponto baixíssimo que fecha a volta; não consome nem produz
  | { kind: "marker"; text: string };

export interface Row {
  label: string;
  kind: "round" | "row";
  start?: "magicRing" | "chain";
  ops: Op[];
  /** "voltas 7–12": esta linha vale por 6. */
  repeatRows?: number;
  declaredCount?: number;
  yarnId?: string;
  note?: string;
  /** Marco do modo de leitura (`#marco texto` depois da volta): o texto que a pessoa lê ao chegar aqui. */
  milestone?: string;
  sourceText?: string;
}

export interface Pattern {
  dialect: Dialect;
  rows: Row[];
}

/** Átomo: operação já expandida (sem repetições nem "rest"). Base do impressor e dos gráficos. */
export type Atom =
  | { kind: "stitch"; code: StitchCode; counted: boolean }
  | { kind: "inc"; k: number }
  | { kind: "dec"; k: number }
  | { kind: "skip" }
  | { kind: "slInto" }
  | { kind: "join" }
  | { kind: "marker"; text: string };

export function atomKey(a: Atom): string {
  switch (a.kind) {
    case "stitch":
      return `${a.code}${a.counted ? "" : "0"}`;
    case "inc":
      return `INC${a.k}`;
    case "dec":
      return `DEC${a.k}`;
    case "marker":
      return `M:${a.text}`;
    default:
      return a.kind.toUpperCase();
  }
}

export interface StitchNode {
  id: number;
  rowIndex: number;
  indexInRow: number;
  code: StitchCode | "RING";
  counted: boolean;
  parents: number[];
  groupWith?: number;
  yarnId: string;
}

export interface StitchGraph {
  nodes: StitchNode[];
  rows: { label: string; kind: "round" | "row"; first: number; last: number; key?: string }[];
}

export interface VerifyRow {
  label: string;
  instruction: string;
  expected?: number;
  found: number;
  status: string;
  ok: boolean;
}

export interface Validation {
  ok: boolean;
  rows: VerifyRow[];
  issues: Issue[];
  /** Total de pontos contados da peça (considera repetições de linhas). */
  totalCounted: number;
  /** Contagem produzida por cada volta, já expandidas as repetições. */
  counts: number[];
}
