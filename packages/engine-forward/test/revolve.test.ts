// SPDX-License-Identifier: GPL-3.0-or-later
// Motor direto (P5a): casos F1 a F9 de docs/08 seção 1.7 e docs/13, com os valores exatos, e as propriedades da seção 5.
import { type Pattern, validate } from "@novelo/core";
import { describe, expect, test } from "vitest";
import { distribute, type ForwardInput, type ProfilePoint, revolve, type Shape } from "../src/index.ts";

const H6 = (6 / (2 * Math.PI)) * 5; // 4,7746 mm: altura em que um disco cresce 6 pontos por volta
const run = (input: ForwardInput) => {
  const r = revolve(input);
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join("; "));
  return r;
};
const counts = (shape: Shape, w: number, h: number, options = {}) =>
  run({ shape, gauge: { w, h }, options }).value.counts;
const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
const short = (t: string[]) =>
  t.map((x) => (x === "SC" ? "pb" : x === "INC2" ? "aum" : x === "DEC" ? "dim" : x)).join(", ");

const F = {
  F1: { shape: { kind: "sphere", radius: (36 * 5) / (2 * Math.PI) } as Shape, w: 5, h: H6 },
  F2: { shape: { kind: "sphere", radius: 30 } as Shape, w: 5, h: 5 },
  F3: { shape: { kind: "cone", halfAngleDeg: 30, slant: 60 } as Shape, w: 5, h: 5 },
  F4: { shape: { kind: "cup", radius: 20, wall: 40 } as Shape, w: 5, h: H6 },
  F5: { shape: { kind: "ellipsoid", radius: 20, halfHeight: 30 } as Shape, w: 5, h: 5 },
};

describe("casos F1 a F5 (docs/08 seção 1.7)", () => {
  const cases: [keyof typeof F, number[], number][] = [
    ["F1", [6, 12, 17, 22, 27, 30, 33, 35, 36, 36, 35, 33, 30, 26, 22, 16, 11, 6], 433],
    ["F2", [6, 12, 18, 23, 28, 32, 35, 37, 38, 38, 36, 34, 31, 27, 23, 17, 11, 6], 452],
    ["F3", [4, 6, 9, 13, 16, 19, 22, 25, 28, 31, 35, 38], 246],
    ["F4", [6, 12, 18, 24, 25, 25, 25, 25, 25, 25, 25, 25], 260],
    ["F5", [6, 12, 16, 19, 22, 24, 25, 25, 25, 24, 22, 19, 15, 11, 6], 271],
  ];
  for (const [id, want, total] of cases) {
    test(`${id}: contagens e total ${total}`, () => {
      const f = F[id];
      const c = counts(f.shape, f.w, f.h);
      expect(c).toEqual(want);
      expect(sum(c)).toBe(total);
    });
  }

  test("F5: o perfil do ovo tem 79,327 mm de comprimento", () => {
    expect(run({ shape: F.F5.shape, gauge: { w: 5, h: 5 } }).value.length).toBeCloseTo(79.327, 2);
  });
});

describe("contagens amigáveis (F6a e F6b)", () => {
  test("F6a: tolerância 1 só muda a volta 3 (17 para 18)", () => {
    const r = run({
      shape: F.F1.shape,
      gauge: { w: 5, h: H6 },
      options: { friendlyMultiple: 6, friendlyTolerance: 1 },
    });
    expect(r.value.counts).toEqual([6, 12, 18, 22, 27, 30, 33, 35, 36, 36, 35, 33, 30, 26, 22, 16, 11, 6]);
    expect(sum(r.value.counts)).toBe(434);
    expect(r.issues.filter((i) => i.code === "FRIENDLY_SNAP").map((i) => (i.row as number) + 1)).toEqual([3]);
  });

  test("F6b: tolerância 2 muda as voltas 3, 4, 8, 11, 16 e 17", () => {
    const r = run({
      shape: F.F1.shape,
      gauge: { w: 5, h: H6 },
      options: { friendlyMultiple: 6, friendlyTolerance: 2 },
    });
    expect(r.value.counts).toEqual([6, 12, 18, 24, 27, 30, 33, 36, 36, 36, 36, 33, 30, 26, 22, 18, 12, 6]);
    expect(sum(r.value.counts)).toBe(441);
    expect(r.issues.filter((i) => i.code === "FRIENDLY_SNAP").map((i) => (i.row as number) + 1)).toEqual([
      3, 4, 8, 11, 16, 17,
    ]);
  });
});

describe("distribuição de aumentos e diminuições (F7 e F8)", () => {
  test("F7: de 12 para 17 sem escalonamento, aumentos nos pais 1, 3, 6, 8 e 10", () => {
    expect(short(distribute(12, 17, 3, "none"))).toBe("pb, aum, pb, aum, pb, pb, aum, pb, aum, pb, aum, pb");
  });

  test("F8: de 18 para 24 com escalonamento, volta ímpar (2 pb, 1 aum) x6 e par adiantada", () => {
    expect(short(distribute(18, 24, 5, "alternate"))).toBe(Array(6).fill("pb, pb, aum").join(", "));
    expect(short(distribute(18, 24, 4, "alternate"))).toBe(
      `pb, aum, ${Array(5).fill("pb, pb, aum").join(", ")}, pb`,
    );
  });

  test("diminuições: de 36 para 30 são 6 dim, e os pais consumidos somam 36", () => {
    const t = distribute(36, 30, 13, "alternate");
    expect(t.filter((x) => x === "DEC")).toHaveLength(6);
    expect(t.length).toBe(30);
    expect(t.reduce((a, x) => a + (x === "DEC" ? 2 : 1), 0)).toBe(36);
  });
});

test("F9: escalar o perfil e a amostra por 2 mantém as contagens de F1 a F5", () => {
  const twice = (s: Shape): Shape => {
    switch (s.kind) {
      case "sphere":
        return { kind: "sphere", radius: s.radius * 2 };
      case "ellipsoid":
        return { kind: "ellipsoid", radius: s.radius * 2, halfHeight: s.halfHeight * 2 };
      case "cone":
        return { ...s, slant: s.slant * 2 };
      case "cup":
        return { kind: "cup", radius: s.radius * 2, wall: s.wall * 2 };
      case "profile":
        return { kind: "profile", points: s.points.map(([r, z]) => [r * 2, z * 2] as ProfilePoint) };
      case "stack":
        return {
          kind: "stack",
          segments: s.segments.map((g) => ({ ...g, radius: g.radius * 2, height: g.height * 2 })),
        };
    }
  };
  for (const f of Object.values(F))
    expect(counts(twice(f.shape), f.w * 2, f.h * 2)).toEqual(counts(f.shape, f.w, f.h));
});

describe("peça composta (P5b)", () => {
  // corpo de três trechos: calota, cilindro e fecho arredondado
  const body: Shape = {
    kind: "stack",
    segments: [
      { radius: 15, height: 15, curve: "round" },
      { radius: 15, height: 20, curve: "line" },
      { radius: 0, height: 15, curve: "round" },
    ],
  };

  test("três trechos geram receita válida que fecha, com a parte reta constante", () => {
    const r = run({ shape: body, gauge: { w: 5, h: 5 } });
    expect(validate(r.value.pattern).ok).toBe(true);
    const c = r.value.counts;
    expect(c[0]).toBe(6);
    expect(c[c.length - 1]).toBeLessThanOrEqual(6);
    const straight = Math.round((2 * Math.PI * 15) / 5); // 19 pontos no cilindro
    expect(c.filter((n) => n === straight).length).toBeGreaterThanOrEqual(4);
    expect(r.value.length).toBeCloseTo(2 * ((Math.PI * 15) / 2) + 20, 0);
  });

  test("calota redonda de raio igual à altura dá as mesmas contagens da meia esfera", () => {
    const dome = counts(
      {
        kind: "stack",
        segments: [
          { radius: 30, height: 30, curve: "round" },
          { radius: 0, height: 30, curve: "round" },
        ],
      },
      5,
      5,
    );
    expect(dome).toEqual(counts({ kind: "sphere", radius: 30 }, 5, 5));
  });

  test("trecho inválido é recusado", () => {
    const r = revolve({
      shape: { kind: "stack", segments: [{ radius: -2, height: 5, curve: "line" }] },
      gauge: { w: 5, h: 5 },
    });
    expect(r.ok).toBe(false);
  });
});

describe("seção não circular e acoplamento (P5c, docs/08 seção 2)", () => {
  /** Posições (índice entre os pais) dos aumentos de cada volta. */
  const incAt = (tokens: string[]) => tokens.flatMap((t, i) => (t === "INC2" || t === "INC3" ? [i] : []));
  const tokensOf = (pattern: Pattern, row: number) =>
    (pattern.rows[row]?.ops ?? []).flatMap((op) =>
      Array<string>("count" in op ? Number(op.count) : 0).fill(
        op.kind === "inc" ? "INC2" : op.kind === "dec" ? "DEC" : "SC",
      ),
    );

  test("regressão: seção redonda pelo acoplamento dá as mesmas contagens e aumentos espalhados por igual", () => {
    for (const f of Object.values(F)) {
      const plain = counts(f.shape, f.w, f.h);
      const viaCoupling = run({ shape: f.shape, gauge: { w: f.w, h: f.h }, section: { ratio: 1 } });
      expect(viaCoupling.value.counts).toEqual(plain);
      // em cada volta que cresce, a distância entre aumentos seguidos (dando a volta) varia no máximo 1 ponto
      viaCoupling.value.counts.forEach((n, i) => {
        if (i === 0) return;
        const prev = viaCoupling.value.counts[i - 1] as number;
        const at = incAt(tokensOf(viaCoupling.value.pattern, i));
        if (n <= prev || at.length < 2) return;
        const gaps = at.map((x, k) => ((at[(k + 1) % at.length] as number) - x + prev) % prev || prev);
        expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
      });
    }
  });

  test("peça achatada (metade da largura) gera receita válida com menos pontos que a redonda", () => {
    const flat = run({
      shape: { kind: "sphere", radius: 30 },
      gauge: { w: 5, h: 5 },
      section: { ratio: 0.5 },
    });
    expect(validate(flat.value.pattern).ok).toBe(true);
    expect(sum(flat.value.counts)).toBeLessThan(452);
  });

  test("saliência: os aumentos se concentram no lado em que a volta cresce", () => {
    // tubo reto com uma saliência a 90 graus que começa a crescer a 20 mm do polo (como o olho de um sapo)
    const tube: Shape = { kind: "cup", radius: 15, wall: 40 };
    const r = run({
      shape: tube,
      gauge: { w: 5, h: 5 },
      section: { bumps: [{ angleDeg: 90, widthDeg: 90, amount: 0.6, from: 25, to: 60 }] },
    });
    expect(validate(r.value.pattern).ok).toBe(true);
    // a primeira volta que cresce dentro do trecho da saliência
    const i = r.value.rows.findIndex(
      (row, k) => k > 0 && row.s >= 25 && row.n > (r.value.counts[k - 1] as number),
    );
    expect(i).toBeGreaterThan(0);
    const prev = r.value.counts[i - 1] as number;
    const at = incAt(tokensOf(r.value.pattern, i));
    expect(at.length).toBeGreaterThanOrEqual(2);
    const angle = (k: number) => (360 * k) / prev;
    const near = at.filter((k) => Math.abs(angle(k) - 90) <= 60).length;
    expect(near / at.length).toBeGreaterThanOrEqual(0.75);
  });

  test("seção inválida é recusada", () => {
    expect(revolve({ shape: F.F2.shape, gauge: { w: 5, h: 5 }, section: { ratio: 0 } }).ok).toBe(false);
    expect(
      revolve({
        shape: F.F2.shape,
        gauge: { w: 5, h: 5 },
        section: { bumps: [{ angleDeg: 0, widthDeg: 0, amount: 1, from: 0, to: 10 }] },
      }).ok,
    ).toBe(false);
  });
});

describe("avisos (docs/08 seção 4)", () => {
  test("a esfera F1 avisa o limite na última volta (ideal 5, feita com 6)", () => {
    const r = run({ shape: F.F1.shape, gauge: { w: 5, h: H6 } });
    expect(r.issues.filter((i) => i.code === "CLAMPED_ROW").map((i) => (i.row as number) + 1)).toEqual([18]);
  });

  test("tigela, trecho fino e peça curta", () => {
    const bowl = run({
      shape: {
        kind: "profile",
        points: [
          [0, 0],
          [20, 0],
          [20, 30],
          [12, 20],
          [12, 40],
        ],
      },
      gauge: { w: 5, h: 5 },
    });
    expect(bowl.issues.map((i) => i.code)).toContain("NOT_STUFFABLE");
    const thin = run({
      shape: {
        kind: "profile",
        points: [
          [0, 0],
          [20, 0],
          [20, 10],
          [2, 12],
          [2, 30],
          [20, 32],
          [20, 40],
        ],
      },
      gauge: { w: 5, h: 5 },
    });
    expect(thin.issues.map((i) => i.code)).toContain("TOO_THIN");
    const tiny = run({ shape: { kind: "sphere", radius: 4 }, gauge: { w: 5, h: 5 } });
    expect(tiny.issues.map((i) => i.code)).toContain("TOO_SHORT");
  });

  test("entrada ruim é recusada com mensagem, sem lançar", () => {
    expect(revolve({ shape: { kind: "sphere", radius: -1 }, gauge: { w: 5, h: 5 } }).ok).toBe(false);
    expect(revolve({ shape: { kind: "sphere", radius: 10 }, gauge: { w: 0, h: 5 } }).ok).toBe(false);
    const open = revolve({
      shape: {
        kind: "profile",
        points: [
          [5, 0],
          [5, 10],
        ],
      },
      gauge: { w: 5, h: 5 },
    });
    expect(open.ok).toBe(false);
    expect(open.issues[0]?.message).toContain("eixo");
  });
});

describe("propriedades (docs/08 seção 5) em perfis sorteados com semente", () => {
  // gerador pseudoaleatório fixo: o teste é o mesmo a cada execução
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const profiles: ProfilePoint[][] = Array.from({ length: 60 }, () => {
    const pts: ProfilePoint[] = [[0, 0]];
    let z = 0;
    const n = 2 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      z += 3 + rnd() * 25;
      pts.push([2 + rnd() * 35, z]);
    }
    if (rnd() < 0.5) pts.push([0, z + 3 + rnd() * 15]);
    return pts;
  });

  test("toda receita gerada passa na validação, respeita os limites por volta e se repete igual", () => {
    for (const points of profiles) {
      const input: ForwardInput = { shape: { kind: "profile", points }, gauge: { w: 5, h: 5 } };
      const r = revolve(input);
      if (!r.ok) {
        // só pode falhar por ser curta demais para uma volta
        expect(r.issues[0]?.code).toBe("TOO_SHORT");
        continue;
      }
      const v = validate(r.value.pattern);
      expect(v.ok).toBe(true);
      expect(v.counts).toEqual(r.value.counts);
      const c = r.value.counts;
      for (let i = 1; i < c.length; i++) {
        expect(c[i]).toBeGreaterThanOrEqual(Math.ceil((c[i - 1] as number) / 2));
        expect(c[i]).toBeLessThanOrEqual(2 * (c[i - 1] as number));
      }
      expect(JSON.stringify(revolve(input))).toBe(JSON.stringify(r));
      const scaled = revolve({
        shape: { kind: "profile", points: points.map(([a, b]) => [a * 3, b * 3] as ProfilePoint) },
        gauge: { w: 15, h: 15 },
      });
      expect(scaled.ok && scaled.value.counts).toEqual(c);
    }
  });
});
