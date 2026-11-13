// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseCpDot } from "../src/index.ts";

const file = new URL("../../../referencia/cp-export-esfera20/crochet.dot", import.meta.url);

test("lê o export real do CrochetPARADE (esfera 20): 152 nós, 321 arestas", () => {
  const r = parseCpDot(readFileSync(file, "utf8"));
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.issues).toEqual([]);
  expect(r.value.dim).toBe(3);
  expect(r.value.nodes).toHaveLength(152);
  expect(r.value.edges).toHaveLength(321);
  expect(r.value.nodes[0]?.name).toBe("0,0|0");
});

test("rejeita dimensão inválida", () => {
  expect(parseCpDot("5\n").ok).toBe(false);
});
