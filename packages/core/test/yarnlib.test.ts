// SPDX-License-Identifier: GPL-3.0-or-later
// Biblioteca de fios: cor por comprimento (listras, degradê, mescla, jaspê), material, espessura e validação.
import { describe, expect, test } from "vitest";
import {
  buildGraph,
  hash01,
  MATERIALS,
  type Op,
  type Pattern,
  THICKNESS,
  thicknessById,
  thicknessRatio,
  validateYarns,
  type Yarn,
  yarnColorAt,
  yarnCursor,
  yarnUsage,
} from "../src/index.ts";

const base: Yarn = { id: "A", name: "a", colorHex: "#102030" };
const stripes = (segmentM = 2): Yarn => ({
  ...base,
  color: { kind: "stripes", colors: ["#ff0000", "#00ff00", "#0000ff"], segmentM },
});

describe("cor por comprimento", () => {
  test("lisa devolve a cor do fio", () => {
    expect(yarnColorAt(base, 12345, 7)).toBe("#102030");
  });
  test("listras trocam a cada trecho e repetem", () => {
    const y = stripes(2);
    expect(yarnColorAt(y, 500)).toBe("#ff0000");
    expect(yarnColorAt(y, 2500)).toBe("#00ff00");
    expect(yarnColorAt(y, 4500)).toBe("#0000ff");
    expect(yarnColorAt(y, 6500)).toBe("#ff0000");
  });
  test("degradê interpola entre as cores", () => {
    const y: Yarn = { ...base, color: { kind: "gradient", colors: ["#000000", "#ffffff"], segmentM: 10 } };
    expect(yarnColorAt(y, 0)).toBe("#000000");
    const mid = yarnColorAt(y, 5000);
    expect(mid).toBe("#808080");
    expect(yarnColorAt(y, 10000)).toBe("#ffffff");
  });
  test("mescla e jaspê são estáveis (mesma entrada, mesma cor) e usam as cores informadas", () => {
    const m: Yarn = { ...base, color: { kind: "melange", colors: ["#ff0000", "#0000ff"], segmentM: 0.2 } };
    expect(yarnColorAt(m, 777, 3)).toBe(yarnColorAt(m, 777, 3));
    const t: Yarn = { ...base, color: { kind: "tweed", colors: ["#808080", "#ff0000"] } };
    const cols = new Set(Array.from({ length: 200 }, (_, i) => yarnColorAt(t, 0, i + 1)));
    expect(cols.has("#808080")).toBe(true);
    expect(cols.size).toBeGreaterThan(1);
  });
  test("material varia o brilho por ponto, conforme o material", () => {
    const flat = new Set(
      Array.from({ length: 50 }, (_, i) => yarnColorAt({ ...base, material: "mohair" }, 0, i)),
    );
    const none = new Set(Array.from({ length: 50 }, (_, i) => yarnColorAt(base, 0, i)));
    expect(none.size).toBe(1);
    expect(flat.size).toBeGreaterThan(5);
  });
  test("hash estável em [0,1)", () => {
    for (let i = 0; i < 100; i++) {
      const h = hash01(i);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
    expect(hash01(42)).toBe(hash01(42));
  });
});

describe("tabelas e espessura", () => {
  test("há padrões de EUA, Reino Unido/Europa e Brasil", () => {
    const regions = new Set(THICKNESS.map((x) => x.region));
    expect([...regions].sort()).toEqual(["br", "eua", "uk-eu"]);
    expect(THICKNESS.filter((x) => x.region === "eua")).toHaveLength(8);
    expect(thicknessById("uk-dk")?.name).toMatch(/DK/);
    expect(MATERIALS.map((m) => m.id)).toEqual([
      "acrilico",
      "algodao",
      "la",
      "mohair",
      "chenille",
      "amigurumi",
    ]);
    // mais grosso = menos metros por 100 g (sanidade dos dados)
    const eua = THICKNESS.filter((x) => x.region === "eua");
    for (let i = 1; i < eua.length; i++) {
      expect((eua[i] as (typeof eua)[number]).diameterMm).toBeGreaterThan(
        (eua[i - 1] as (typeof eua)[number]).diameterMm,
      );
      expect((eua[i] as (typeof eua)[number]).mPer100g).toBeLessThan(
        (eua[i - 1] as (typeof eua)[number]).mPer100g,
      );
    }
  });
  test("razão de espessura em relação ao fio A", () => {
    const a: Yarn = { ...base, thickness: { id: "cyc-3", diameterMm: 2 } };
    const b: Yarn = { ...base, id: "B", thickness: { id: "cyc-5", diameterMm: 3.5 } };
    expect(thicknessRatio(b, a)).toBeCloseTo(1.75);
    expect(thicknessRatio(undefined, undefined)).toBe(1);
    expect(thicknessRatio({ ...base, thickness: { diameterMm: 20 } }, a)).toBe(3);
  });
});

describe("validação dos fios", () => {
  test("aceita cor, material e espessura; cor lisa some; colorHex vira a primeira cor", () => {
    const [y] = validateYarns([
      {
        ...base,
        color: { kind: "stripes", colors: ["#AA0000", "#00bb00"], segmentM: 3 },
        material: "la",
        thickness: { id: "br-amigurumi" },
      },
    ]);
    expect(y?.colorHex).toBe("#aa0000");
    expect(y?.color?.colors).toEqual(["#aa0000", "#00bb00"]);
    expect(y?.thickness).toEqual({ id: "br-amigurumi", diameterMm: 1.6 });
    const [s] = validateYarns([{ ...base, color: { kind: "solid", colors: ["#ffffff"] } }]);
    expect(s?.color).toBeUndefined();
    expect(s?.colorHex).toBe("#102030");
  });
  test("recusa valores inválidos com mensagem clara", () => {
    expect(() => validateYarns([{ ...base, color: { kind: "xadrez", colors: ["#ffffff"] } }])).toThrow(
      /tipo de cor/,
    );
    expect(() => validateYarns([{ ...base, color: { kind: "stripes", colors: [] } }])).toThrow(
      /de 1 a 6 cores/,
    );
    expect(() => validateYarns([{ ...base, color: { kind: "stripes", colors: ["red"] } }])).toThrow(
      /#rrggbb/,
    );
    expect(() => validateYarns([{ ...base, material: "seda" }])).toThrow(/material/);
    expect(() => validateYarns([{ ...base, thickness: { id: "xx" } }])).toThrow(/desconhecido/);
    expect(() => validateYarns([{ ...base, thickness: { diameterMm: 50 } }])).toThrow(/entre 0,2 e 20/);
  });
});

describe("comprimento gasto e consumo", () => {
  const sc = (count: number): Op => ({ kind: "stitch", code: "SC", count });
  const p: Pattern = {
    dialect: "pt-BR",
    rows: [
      { label: "1", kind: "round", ops: [sc(6)], start: "magicRing" },
      { label: "2", kind: "round", ops: [{ kind: "inc", k: 2, count: 6 }] },
    ],
  };
  const g = buildGraph(p);
  test("cursor soma o comprimento por fio, no meio de cada ponto", () => {
    const c = yarnCursor(g, 5);
    const per = 4.2 * 5;
    expect(c[0]).toBe(0); // anel
    expect(c[1]).toBeCloseTo(per / 2);
    expect(c[2]).toBeCloseTo(per + per / 2);
  });
  test("fio mais grosso gasta proporcionalmente mais", () => {
    const base1 = yarnUsage(g, 5)[0]?.lengthMm as number;
    const thick = yarnUsage(g, 5, () => 2)[0]?.lengthMm as number;
    expect(thick).toBeCloseTo(base1 * 2);
  });
});
