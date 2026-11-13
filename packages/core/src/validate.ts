// SPDX-License-Identifier: GPL-3.0-or-later
import { simulateRow, type Top } from "./simulate.ts";
import type { Issue, Pattern, Validation, VerifyRow } from "./types.ts";

const pontos = (n: number): string => `${n} ponto${n === 1 ? "" : "s"}`;

/** Expande as linhas (com repetições) e confere contagens. Docs 07 seção 3. */
export function validate(pattern: Pattern): Validation {
  const issues: Issue[] = [];
  const rows: VerifyRow[] = [];
  const counts: number[] = [];
  let prev: Top[] = [];
  let nextId = 0;
  let total = 0;

  pattern.rows.forEach((row, ri) => {
    const first = ri === 0;
    const free = first || row.start !== undefined;
    if (first && row.start === undefined) {
      issues.push({
        code: "FIRST_ROW_NO_START",
        severity: "error",
        row: ri,
        message: `Volta ${row.label}: a primeira linha precisa de anel mágico, corrente ou base.`,
      });
    }
    if (first && row.start === "magicRing") {
      prev = [{ id: nextId++, counted: false }]; // nó do anel
    }
    const reps = row.repeatRows ?? 1;
    let status = "OK";
    let found = 0;
    let rowOk = true;
    for (let rep = 0; rep < reps; rep++) {
      const prevCount = prev.filter((t) => t.counted).length;
      const sim = simulateRow(row, prev, nextId, free && rep === 0);
      nextId += sim.nodes.length;
      found = sim.producedCounted;
      counts.push(found);
      total += found;
      let st = "OK";
      if (sim.over > 0) {
        st = `Falta ${pontos(sim.over)}`;
        issues.push({
          code: "CONSUME_OVER",
          severity: "error",
          row: ri,
          message: `Volta ${row.label}: tenta consumir ${pontos(sim.over)} a mais do que existem na volta anterior.`,
        });
      } else if (sim.unused > 0) {
        st = `Sobra ${pontos(sim.unused)}`;
        issues.push({
          code: "CONSUME_UNDER",
          severity: "warning",
          row: ri,
          message: `Volta ${row.label}: ${pontos(sim.unused)} da volta anterior ficam sem trabalhar.`,
        });
      } else if (row.declaredCount !== undefined && row.declaredCount !== found) {
        st = "Total declarado errado";
        issues.push({
          code: "COUNT_MISMATCH",
          severity: "error",
          row: ri,
          message: `Volta ${row.label}: total declarado ${row.declaredCount}, mas a receita produz ${found}.`,
        });
      }
      if (prevCount > 0 && found > prevCount * 2) {
        issues.push({
          code: "STEEP_INCREASE",
          severity: "warning",
          row: ri,
          message: `Volta ${row.label}: ${found} pontos é mais que o dobro de ${prevCount}.`,
        });
      }
      if (prevCount > 0 && found * 2 < prevCount) {
        issues.push({
          code: "STEEP_DECREASE",
          severity: "warning",
          row: ri,
          message: `Volta ${row.label}: ${found} pontos é menos que a metade de ${prevCount}.`,
        });
      }
      if (st !== "OK" && status === "OK") status = st;
      if (st !== "OK") rowOk = false;
      prev = sim.nodes.map((n) => ({ id: n.id, counted: n.counted }));
    }
    const vr: VerifyRow = { label: row.label, instruction: row.sourceText ?? "", found, status, ok: rowOk };
    if (row.declaredCount !== undefined) vr.expected = row.declaredCount;
    rows.push(vr);
  });

  return { ok: !issues.some((i) => i.severity === "error"), rows, issues, totalCounted: total, counts };
}
