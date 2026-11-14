// SPDX-License-Identifier: GPL-3.0-or-later
// Notação: leitura (tolerante) e escrita de receitas em pt-BR, en-US e en-UK.
import type { Result } from "@novelo/core";

export { NAMES, WORDS } from "./dictionary.ts";
export { detectDialect, type ParseOptions, type ParseResult, parsePattern } from "./parse.ts";
export { foldKeys, printPattern, type Seg, segText } from "./print.ts";
export { printPatternWithYarns, type YarnChange, type YarnPrint } from "./print-yarns.ts";

/** Divide o texto em linhas não vazias. */
export function splitLines(text: string): Result<string[]> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return { ok: true, value: lines, issues: [] };
}
