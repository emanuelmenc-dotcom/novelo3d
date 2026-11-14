// SPDX-License-Identifier: GPL-3.0-or-later
// Peças e montagem: original, instância, espelhada, cópia, costuras entre linhas contínuas e vista de montagem.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  dispatch,
  exportEditAll,
  exportParts,
  loadEdit,
  loadEditAll,
  loadPaint,
  loadParts,
  partsSnapshot,
  resetPaint,
  resetParts,
} from "../src/index.ts";
import { expectReplayMatchesLive } from "./replay-check.ts";

const TEXT = [
  "V1: 6 pb no anel mágico (6)",
  "V2: 6 aum (12)",
  "V3: (1 pb, 1 aum) x6 (18)",
  "V4: (2 pb, 1 aum) x6 (24)",
  "V5: 24 pb (24)",
].join("\n");
const N = 1 + 6 + 12 + 18 + 24 + 24;

type View = {
  active: string;
  parts: {
    id: string;
    name: string;
    kind: string;
    source: string | null;
    mirror: string | null;
    pos: number[];
  }[];
};
type Lay = {
  nodes: { id: number; part: string; uid: number; color?: string }[];
  positions: number[];
  seamLines: number[];
  parts: { id: string; offset: number; count: number; error: string | null }[];
};

beforeEach(() => {
  loadPaint({});
  loadEdit({});
  resetParts(TEXT);
  dispatch("yarns.set", {
    yarns: [
      { id: "A", name: "a", colorHex: "#5d6b3a" },
      { id: "B", name: "b", colorHex: "#f4f1e8" },
    ],
  });
});
afterEach(() => {
  expectReplayMatchesLive();
  loadEdit({});
  resetParts("");
  resetPaint();
});

const select = (text: string, group: number) =>
  dispatch("selection.select", { text, by: { kind: "group", from: group } });

describe("peças", () => {
  test("começa com uma peça original; adicionar, instanciar, espelhar e copiar", () => {
    expect((dispatch("parts.get") as View).parts).toHaveLength(1);
    dispatch("parts.setText", { id: "p1", text: TEXT });
    let v = dispatch("parts.instance", { id: "p1" }) as View;
    v = dispatch("parts.mirror", { id: "p1", plane: "x" }) as View;
    v = dispatch("parts.copy", { id: "p1" }) as View;
    v = dispatch("parts.add", { name: "Orelha", text: "V1: 6 pb no anel mágico (6)" }) as View;
    expect(v.parts.map((p) => p.kind)).toEqual(["own", "instance", "mirror", "own", "own"]);
    expect(v.parts[2]).toMatchObject({ source: "p1", mirror: "x" });
    expect(v.parts[3]?.source).toBeNull();
    expect(v.parts[4]?.name).toBe("Orelha");
  });

  test("a instância acompanha a original (receita, fio e tensão); a cópia é independente", () => {
    dispatch("parts.instance", { id: "p1" });
    dispatch("parts.copy", { id: "p1" });
    // pinta a volta 3 da original com B
    select(TEXT, 3);
    dispatch("points.set", { text: TEXT, prop: "yarn", value: "B" });
    const lay = dispatch("assembly.layout", {}) as Lay;
    const color = (part: string, uid: number) =>
      lay.nodes.find((n) => n.part === part && n.uid === uid)?.color;
    expect(color("p1", 20)).toBe("#f4f1e8");
    expect(color("p2", 20)).toBe("#f4f1e8"); // instância acompanha
    expect(color("p3", 20)).toBe("#5d6b3a"); // cópia feita antes da edição: independente
    // editar a cópia não muda a original
    dispatch("parts.setActive", { id: "p3" });
    select(TEXT, 4);
    dispatch("points.set", { text: TEXT, prop: "yarn", value: "B" });
    const lay2 = dispatch("assembly.layout", {}) as Lay;
    const c2 = (part: string, uid: number) => lay2.nodes.find((n) => n.part === part && n.uid === uid)?.color;
    expect(c2("p3", 40)).toBe("#f4f1e8");
    expect(c2("p1", 40)).toBe("#5d6b3a");
    expect(c2("p2", 40)).toBe("#5d6b3a");
  });

  test("troca de fios só na instância; tornar cópia solta a instância", () => {
    select(TEXT, 3);
    dispatch("points.set", { text: TEXT, prop: "yarn", value: "B" });
    dispatch("parts.instance", { id: "p1" });
    dispatch("parts.set", { id: "p2", yarnMap: { B: "A" } });
    const lay = dispatch("assembly.layout", {}) as Lay;
    expect(lay.nodes.find((n) => n.part === "p1" && n.uid === 20)?.color).toBe("#f4f1e8");
    expect(lay.nodes.find((n) => n.part === "p2" && n.uid === 20)?.color).toBe("#5d6b3a");
    expect(() => dispatch("parts.set", { id: "p1", yarnMap: { A: "B" } })).toThrow(/instâncias/);
    const v = dispatch("parts.detach", { id: "p2" }) as View;
    expect(v.parts[1]?.kind).toBe("own");
    expect(() => dispatch("parts.detach", { id: "p2" })).toThrow(/já é uma peça original/);
  });

  test("espelhada reflete as posições no plano e a posição move a peça", () => {
    dispatch("parts.mirror", { id: "p1", plane: "x" });
    dispatch("parts.set", { id: "p2", pos: [0, 0, 0] });
    const lay = dispatch("assembly.layout", {}) as Lay;
    expect(lay.nodes.length).toBe(2 * N);
    const base = lay.parts[1]?.offset as number;
    for (const i of [0, 7, 30, 80]) {
      expect(lay.positions[(base + i) * 3]).toBeCloseTo(-(lay.positions[i * 3] as number), 2);
      expect(lay.positions[(base + i) * 3 + 1]).toBeCloseTo(lay.positions[i * 3 + 1] as number, 2);
    }
    dispatch("parts.set", { id: "p2", mirror: "y", pos: [10, 0, 0], rot: [0, 0, 90] });
    expect(() => dispatch("parts.set", { id: "p1", mirror: "x" })).toThrow(/espelhadas/);
    expect(() => dispatch("parts.set", { id: "p2", pos: [1, 2] })).toThrow(/\[x, y, z\]/);
  });

  test("remover: não deixa a origem de uma instância nem peça com costura", () => {
    dispatch("parts.instance", { id: "p1" });
    expect(() => dispatch("parts.remove", { id: "p1" })).toThrow(/usa 'Peça 1' como origem/);
    expect((dispatch("parts.remove", { id: "p2" }) as View).parts).toHaveLength(1);
    expect(() => dispatch("parts.remove", { id: "p1" })).toThrow(/pelo menos uma peça/);
  });
});

describe("costuras", () => {
  const two = () => {
    dispatch("parts.instance", { id: "p1" });
    dispatch("parts.set", { id: "p2", pos: [0, 0, 30] });
  };

  test("rascunho pelos lados A e B, validação e criação entre peças", () => {
    two();
    select(TEXT, 5);
    expect(dispatch("seam.draft", { side: "a" })).toMatchObject({ side: "a", count: 24, closed: true });
    dispatch("parts.setActive", { id: "p2" });
    select(TEXT, 5);
    dispatch("seam.draft", { side: "b" });
    const chk = dispatch("seam.validate", {}) as { ok: boolean; pairs: [number, number][] };
    expect(chk.ok).toBe(true);
    expect(chk.pairs).toHaveLength(24);
    const r = dispatch("seam.add", { name: "Corpo-Corpo", type: "whip", reverse: true }) as { pairs: number };
    expect(r.pairs).toBe(24);
    const lay = dispatch("assembly.layout", {}) as Lay;
    expect(lay.seamLines).toHaveLength(48);
    const list = dispatch("seam.list") as { seams: { ok: boolean; name: string; type: string }[] };
    expect(list.seams[0]).toMatchObject({ ok: true, name: "Corpo-Corpo", type: "whip" });
    expect(() => dispatch("parts.remove", { id: "p2" })).toThrow(/costura 'Corpo-Corpo'/);
  });

  test("proporção: 18 contra 12 não fecha 1:1; sugere 3:2 e aceita 3:2", () => {
    two();
    select(TEXT, 3);
    dispatch("seam.draft", { side: "a" });
    dispatch("parts.setActive", { id: "p2" });
    select(TEXT, 2);
    dispatch("seam.draft", { side: "b" });
    const bad = dispatch("seam.validate", {}) as { ok: boolean; errors: string[]; suggestedRatio: number[] };
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toMatch(/A tem 18 pontos e B tem 12; use 3:2/);
    expect(bad.suggestedRatio).toEqual([3, 2]);
    expect(() => dispatch("seam.add", {})).toThrow(/costura inválida/);
    const ok = dispatch("seam.validate", { ratio: [3, 2] }) as { ok: boolean; pairs: unknown[] };
    expect(ok.ok).toBe(true);
    expect(ok.pairs).toHaveLength(18);
    expect(() => dispatch("seam.validate", { ratio: [0, 1] })).toThrow(/inteiros de 1 a 8/);
  });

  test("lados que não são linha contínua são recusados", () => {
    two();
    select(TEXT, 3);
    dispatch("selection.select", { text: TEXT, by: { kind: "group", from: 4 }, op: "add" });
    expect(() => dispatch("seam.draft", { side: "a" })).toThrow(/não é uma linha contínua/);
    dispatch("selection.clear");
    expect(() => dispatch("seam.draft", { side: "x" })).toThrow(/'a' ou 'b'/);
  });

  test("costura dentro da mesma peça; lados com pontos em comum são recusados", () => {
    select(TEXT, 5);
    dispatch("seam.draft", { side: "a" });
    dispatch("seam.draft", { side: "b" });
    const same = dispatch("seam.validate", {}) as { ok: boolean; errors: string[] };
    expect(same.ok).toBe(false);
    expect(same.errors.join(" ")).toMatch(/compartilham pontos/);
    select(TEXT, 4);
    dispatch("seam.draft", { side: "b" });
    const r = dispatch("seam.validate", {}) as { ok: boolean; pairs: unknown[] };
    expect(r.ok).toBe(true); // 24 e 24, voltas vizinhas da mesma peça
    expect(r.pairs).toHaveLength(24);
  });

  test("seam.set revalida; seam.remove apaga", () => {
    two();
    select(TEXT, 5);
    dispatch("seam.draft", { side: "a" });
    dispatch("parts.setActive", { id: "p2" });
    dispatch("seam.draft", { side: "b" });
    dispatch("seam.add", {});
    expect(() => dispatch("seam.set", { id: "s1", ratio: [2, 1] })).toThrow(/a contagem não fecha com 2:1/);
    dispatch("seam.set", { id: "s1", reverse: true, name: "Nova", type: "slip" });
    expect((dispatch("seam.list") as { seams: { name: string }[] }).seams[0]?.name).toBe("Nova");
    dispatch("seam.remove", { id: "s1" });
    expect((dispatch("seam.list") as { seams: unknown[] }).seams).toHaveLength(0);
    expect(() => dispatch("seam.remove", { id: "s1" })).toThrow(/não existe/);
  });

  test("mudar a receita da original invalida a costura, com mensagem", () => {
    two();
    select(TEXT, 5);
    dispatch("seam.draft", { side: "a" });
    dispatch("parts.setActive", { id: "p2" });
    dispatch("seam.draft", { side: "b" });
    dispatch("seam.add", {});
    dispatch("parts.setText", { id: "p1", text: "V1: 6 pb no anel mágico (6)\nV2: 6 aum (12)" });
    const list = dispatch("seam.list") as { seams: { ok: boolean; errors: string[] }[] };
    expect(list.seams[0]?.ok).toBe(false);
    expect(list.seams[0]?.errors[0]).toMatch(/não existem mais/);
  });
});

describe("persistência", () => {
  test("peças, costuras e edições de cada peça voltam como estavam", () => {
    dispatch("parts.copy", { id: "p1" });
    dispatch("parts.setActive", { id: "p2" });
    select(TEXT, 3);
    dispatch("points.set", { text: TEXT, prop: "yarn", value: "B" });
    dispatch("parts.setActive", { id: "p1" });
    const parts = JSON.parse(JSON.stringify(exportParts()));
    const edits = JSON.parse(JSON.stringify(exportEditAll()));
    resetParts("");
    loadEdit({});
    loadParts(parts, { text: "" });
    loadEditAll(edits, partsSnapshot().active);
    const lay = dispatch("assembly.layout", {}) as Lay;
    expect(lay.nodes.find((n) => n.part === "p2" && n.uid === 20)?.color).toBe("#f4f1e8");
    expect(lay.nodes.find((n) => n.part === "p1" && n.uid === 20)?.color).toBe("#5d6b3a");
  });

  test("formato antigo de uma peça só vira a peça p1; dados inválidos caem no padrão", () => {
    loadEditAll({ yarn: [[20, 1]], tension: [], defaultTension: 0, selection: [] }, "p1");
    loadParts({ parts: "lixo" }, { text: TEXT });
    expect(partsSnapshot().parts).toHaveLength(1);
    expect(partsSnapshot().parts[0]?.text).toBe(TEXT);
    const lay = dispatch("assembly.layout", {}) as Lay;
    expect(lay.nodes.find((n) => n.uid === 20)?.color).toBe("#f4f1e8");
  });
});
