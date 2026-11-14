// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { chainSegs } from "../src/index.ts";

const rep = (k: string, n: number): string[] => Array(n).fill(k);

describe("chainSegs (cadeias do gráfico v3)", () => {
  it("G13: corr* inicial, bloco (pb, corr) x9 e dois pbx", () => {
    const keys = ["CH0", ...Array.from({ length: 9 }, () => ["SC", "CH"]).flat(), "SL", "SL"];
    expect(chainSegs(keys)).toEqual([
      { t: "run", key: "CH0", count: 1 },
      { t: "block", keys: ["SC", "CH"], times: 9 },
      { t: "run", key: "SL", count: 2 },
    ]);
  });
  it("G14: corridas separadas não se fundem (o período passa de 4 pontos)", () => {
    const keys = ["CH0", ...rep("SC", 4), ...rep("SL", 3), ...rep("SC", 4), ...rep("SL", 3), "JOIN"];
    expect(chainSegs(keys).map((s) => (s.t === "run" ? `${s.count}${s.key}` : "bloco"))).toEqual([
      "1CH0",
      "4SC",
      "3SL",
      "4SC",
      "3SL",
      "1JOIN",
    ]);
  });
  it("marcadores ficam de fora e volta vazia dá lista vazia", () => {
    expect(chainSegs(["M:olho", "SC", "SC"])).toEqual([{ t: "run", key: "SC", count: 2 }]);
    expect(chainSegs([])).toEqual([]);
  });
});
