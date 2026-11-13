// SPDX-License-Identifier: GPL-3.0-or-later
// Medição do R3d-1: quanto a simulação ponto a ponto desloca os pontos do layout base (em unidades de k) e em quanto
// tempo. Decide se vale construir o armazenamento (R3d-2): média < 0,02·k e máximo < 0,15·k = a imagem não muda.
import { buildGraph } from "@novelo/core";
import { layoutGraph } from "@novelo/layout";
import { parsePattern } from "@novelo/notation";
import { createSimulation } from "@novelo/stitch3d";
import { expect, test } from "vitest";

const EXEMPLO = `V1: 6 pb no anel mágico (6)
V2: 6 aum (12)
V3: (1 pb, 1 aum) x6 (18)
V4: (2 pb, 1 aum) x6 (24)
V5: (3 pb, 1 aum) x6 (30)
V6: (4 pb, 1 aum) x6 (36)
V7–12: 1 pb em cada ponto (36)
V13: (4 pb, 1 dim) x6 (30)
V14: (3 pb, 1 dim) x6 (24)
V15: (2 pb, 1 dim) x6 (18)
V16: (1 pb, 1 dim) x6 (12)
V17: 6 dim (6)`;

/** Tamanhos por ponto: 1 (uniforme), "tensao" (voltas alternadas 1,4 / 0,8) ou "fios" (voltas 6 a 12 com fio grosso 1,6). */
function sizesOf(g: ReturnType<typeof buildGraph>, kind: string): number[] {
  return g.nodes.map((nd) => {
    if (kind === "tensao") return nd.rowIndex % 3 === 0 ? 1.4 : nd.rowIndex % 3 === 1 ? 0.8 : 1;
    if (kind === "fios") return nd.rowIndex >= 5 && nd.rowIndex <= 11 ? 1.6 : 1;
    return 1;
  });
}

function measure(text: string, collision: boolean, moveBases: boolean, kind = "uniforme") {
  const g = buildGraph(parsePattern(text).pattern);
  const r = layoutGraph(g);
  const n = g.nodes.length;
  const size = sizesOf(g, kind);
  const sim = createSimulation({
    base: r.positions,
    start: r.positions,
    edges: r.edges,
    parents: g.nodes.map((nd) => nd.parents),
    size,
    dirty: new Array(n).fill(1),
    collision,
    moveBases,
  });
  // pares não adjacentes abaixo do limiar de colisão (0,7·k) no layout base, por volta
  const adj = new Set<number>();
  for (let e = 0; e + 1 < r.edges.length; e += 2) {
    adj.add((r.edges[e] as number) * n + (r.edges[e + 1] as number));
    adj.add((r.edges[e + 1] as number) * n + (r.edges[e] as number));
  }
  const overlapRows = new Map<number, number>();
  let overlaps = 0;
  // contagem de pares é O(n²): só nos exemplos pequenos
  for (let a = 0; a < (n <= 3000 ? n : 0); a++) {
    for (let b = a + 1; b < n; b++) {
      if (adj.has(a * n + b)) continue;
      const d = Math.hypot(
        (r.positions[a * 3] as number) - (r.positions[b * 3] as number),
        (r.positions[a * 3 + 1] as number) - (r.positions[b * 3 + 1] as number),
        (r.positions[a * 3 + 2] as number) - (r.positions[b * 3 + 2] as number),
      );
      if (d < 0.7 * sim.k * (((size[a] as number) + (size[b] as number)) / 2)) {
        overlaps++;
        const row = (g.nodes[b] as { rowIndex: number }).rowIndex;
        overlapRows.set(row, (overlapRows.get(row) ?? 0) + 1);
      }
    }
  }
  const t0 = performance.now();
  sim.step(n);
  const ms = performance.now() - t0;
  return {
    n,
    ms,
    overlaps,
    overlapRows: [...overlapRows].map(([row, c]) => `V${row + 1}:${c}`).join(" "),
    ...sim.stats(),
  };
}

test("medição: exemplo inteiro, tudo sujo, com e sem colisão, tensão e fios variados", () => {
  for (const kind of ["uniforme", "tensao", "fios"]) {
    for (const [collision, moveBases] of [
      [true, false],
      [true, true],
    ] as const) {
      const m = measure(EXEMPLO, collision, moveBases, kind);
      console.log(
        `R3d-1 ${kind} (${m.n} pontos) colisão=${collision} bases=${moveBases}: média ${m.meanShift.toFixed(4)}·k, máx ${m.maxShift.toFixed(4)}·k, ${m.ms.toFixed(0)} ms; pares não adjacentes < 0,7·k no layout base: ${m.overlaps} [${m.overlapRows}]`,
      );
      expect(Number.isFinite(m.meanShift)).toBe(true);
      expect(m.simulated).toBe(m.n);
    }
  }
});

// pesado (concorre com os testes de tempo dos outros pacotes): só roda com NOVELO_BENCH=1
test.skipIf(!process.env.NOVELO_BENCH)(
  "20 mil pontos sintéticos em menos de 30 s",
  { timeout: 120_000 },
  () => {
    const rows = Math.ceil(20000 / 36);
    const text = `${EXEMPLO.split("\n").slice(0, 6).join("\n")}\nV7–${rows + 6}: 1 pb em cada ponto (36)`;
    const m = measure(text, true, true);
    console.log(
      `R3d-1 sintético (${m.n} pontos): média ${m.meanShift.toFixed(4)}·k, máx ${m.maxShift.toFixed(4)}·k, ${m.ms.toFixed(0)} ms`,
    );
    expect(m.n).toBeGreaterThan(15000);
    expect(m.ms).toBeLessThan(30_000);
  },
);
