// SPDX-License-Identifier: GPL-3.0-or-later
// Criador de pontos, etapa B (docs/16): máquina de estados das alças, tipo mais próximo e recusas.
import { describe, expect, test } from "vitest";
import { stitchBuilder as B, buildGraph, type Op, type Pattern, stitchType } from "../src/index.ts";

const Y: B.Cmd = { kind: "yo" };
const I = (base?: number, mode?: B.InsertMode): B.Cmd => ({
  kind: "insert",
  ...(base === undefined ? {} : { base }),
  ...(mode === undefined ? {} : { mode }),
});
const D = (k: number): B.Cmd => ({ kind: "draw", k });
const F: B.Cmd = { kind: "finish" };

const group = (n: number, ...cmds: B.Cmd[]): B.Cmd[] => Array.from({ length: n }, () => cmds).flat();

interface Row9 {
  name: string;
  cmds: B.Cmd[];
  /** Alças depois de cada comando. */
  trace: number[];
  type: string;
  legs: number;
  exact: boolean;
}

const TABLE: Row9[] = [
  { name: "corrente", cmds: [Y, D(1), F], trace: [2, 1, 1], type: "CH", legs: 0, exact: true },
  { name: "pbx", cmds: [I(0), D(1), F], trace: [2, 1, 1], type: "SL", legs: 1, exact: true },
  { name: "pb", cmds: [I(0), Y, D(2), F], trace: [2, 3, 1, 1], type: "SC", legs: 1, exact: true },
  { name: "mpa", cmds: [Y, I(0), Y, D(3), F], trace: [2, 3, 4, 1, 1], type: "HDC", legs: 1, exact: true },
  {
    name: "pa",
    cmds: [Y, I(0), Y, D(2), Y, D(2), F],
    trace: [2, 3, 4, 2, 3, 1, 1],
    type: "DC",
    legs: 1,
    exact: true,
  },
  {
    name: "pad",
    cmds: [Y, Y, I(0), Y, D(2), Y, D(2), Y, D(2), F],
    trace: [2, 3, 4, 5, 3, 4, 2, 3, 1, 1],
    type: "TR",
    legs: 1,
    exact: true,
  },
  {
    name: "pb2juntos",
    cmds: [I(0), I(1), Y, D(3), F],
    trace: [2, 3, 4, 1, 1],
    type: "SC",
    legs: 2,
    exact: false,
  },
  {
    name: "puff",
    cmds: [...group(4, Y, I(0)), Y, D(9), F],
    trace: [2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 1],
    type: "HDC",
    legs: 1,
    exact: false,
  },
  {
    name: "bobble",
    cmds: [...group(4, Y, I(0), Y, D(2)), Y, D(5), F],
    trace: [2, 3, 4, 2, 3, 4, 5, 3, 4, 5, 6, 4, 5, 6, 7, 5, 6, 1, 1],
    type: "DC",
    legs: 1,
    exact: false,
  },
];

function run(cmds: B.Cmd[]): { state: B.BuilderState; trace: number[] } {
  let state = B.start();
  const trace: number[] = [];
  for (const c of cmds) {
    const r = B.apply(state, c);
    if (!r.ok) throw new Error(`recusado: ${c.kind} (${r.reason})`);
    state = r.state;
    trace.push(state.loops.length);
  }
  return { state, trace };
}

describe("pb do usuário", () => {
  test("inserir, laçada, puxar pelas 2 alças, terminar: 2, 3 e 1 alças; resultado SC, 1 perna, exato", () => {
    let s = B.start();
    expect(s.loops.length).toBe(1);
    const steps: [B.Cmd, number][] = [
      [I(0), 2],
      [Y, 3],
      [D(2), 1],
    ];
    for (const [c, n] of steps) {
      const r = B.apply(s, c);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
      expect(s.loops.length).toBe(n);
    }
    // a alça nova atravessou as duas de baixo (a puxada e a inicial), da mais próxima da ponta para trás
    expect(s.events[2]?.through).toEqual([1, 0]);
    expect(B.allowed(s).finish).toBe(true);
    const done = B.apply(s, F);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    const sum = B.summarize(done.state);
    expect(sum).toMatchObject({ type: "SC", legs: 1, consumed: 1, produced: 1, exact: true, complete: true });
  });
});

describe("tabela dos 9 pontos", () => {
  for (const row of TABLE) {
    test(`${row.name}: alças passo a passo e resumo`, () => {
      const { state, trace } = run(row.cmds);
      expect(trace).toEqual(row.trace);
      const sum = B.summarize(state);
      expect(sum.type).toBe(row.type);
      expect(sum.legs).toBe(row.legs);
      expect(sum.consumed).toBe(row.legs);
      expect(sum.produced).toBe(1);
      expect(sum.exact).toBe(row.exact);
      expect(sum.complete).toBe(true);
      // wraps e lengthFactor vêm do registro, não são calculados
      const def = stitchType(row.type);
      expect(sum.wraps).toBe(def?.model.wraps);
      expect(sum.lengthFactor).toBe(def?.lengthFactor);
    });
  }

  test("sem comandos o tipo é indefinido; com insert e nenhuma laçada é SL", () => {
    expect(B.summarize(B.start()).type).toBeNull();
    expect(B.typeOf([I(0), D(1)])).toBe("SL");
  });
});

describe("oráculo do próprio pipeline: o resumo da máquina bate com o que o grafo produz", () => {
  // cada linha da tabela vira uma operação da receita a partir do RESUMO (não de constantes), e o nó gerado tem de ter
  // o mesmo tipo e o mesmo número de pais (pernas)
  const opFor = (type: string, legs: number): Op =>
    legs >= 2
      ? { kind: "dec", k: legs, count: 3 }
      : { kind: "stitch", code: type as "SL" | "SC" | "HDC" | "DC" | "TR", count: 6 };
  const ring: Pattern["rows"] = [
    { label: "1", kind: "round", ops: [{ kind: "stitch", code: "SC", count: 6 }], start: "magicRing" },
  ];
  for (const row of TABLE) {
    test(`${row.name}: tipo e pais do nó = resumo`, () => {
      const sum = B.summarize(run(row.cmds).state);
      const rows: Pattern["rows"] =
        sum.type === "CH"
          ? [{ label: "1", kind: "round", ops: [{ kind: "stitch", code: "CH", count: 3 }] }]
          : [...ring, { label: "2", kind: "round", ops: [opFor(sum.type as string, sum.legs)] }];
      const g = buildGraph({ dialect: "en-US", rows });
      const node = g.nodes[g.rows[g.rows.length - 1]?.first ?? 0];
      expect(node?.code).toBe(sum.type);
      expect(node?.parents.length).toBe(sum.legs);
    });
  }
});

describe("recusas", () => {
  const reason = (state: B.BuilderState, c: B.Cmd) => {
    const r = B.apply(state, c);
    return r.ok ? "ok" : r.reason;
  };
  const after = (...cmds: B.Cmd[]) => run(cmds).state;

  test("finish no começo e com 2 alças", () => {
    expect(reason(B.start(), F)).toBe("no_draw_yet");
    expect(reason(after(Y), F)).toBe("need_one_loop");
  });

  test("ponto pronto (1 alça depois de um draw): só o fim do ponto é aceito; dois pb não viram pb2juntos", () => {
    const pb = after(I(0), Y, D(2));
    for (const c of [I(1), I(0), Y, D(1)]) expect(reason(pb, c)).toBe("stitch_done");
    expect(reason(pb, F)).toBe("ok");
    expect(B.allowed(pb)).toEqual({ yo: false, insert: false, drawMax: 0, finish: true });
    // a sequência de dois pb seguidos é recusada já no segundo insert
    expect(B.replay([I(0), Y, D(2), I(1), Y, D(2)])).toEqual({ ok: false, reason: "stitch_done", at: 3 });
    // as 9 sequências da tabela nunca passam por 1 alça no meio (só no fim)
    for (const row of TABLE) {
      const mid = run(row.cmds.slice(0, -1)).trace.slice(0, -1);
      expect(mid.every((n) => n > 1)).toBe(true);
    }
  });

  test("draw(0), draw(alças) e k inválido", () => {
    expect(reason(after(Y), D(0))).toBe("bad_k");
    expect(reason(after(Y), D(2))).toBe("k_too_big");
    expect(reason(after(Y), D(1.5))).toBe("bad_k");
    expect(reason(B.start(), D(1))).toBe("k_too_big");
  });

  test("insert sem base, com base inválida, que pula, que volta e a quinta base distinta", () => {
    expect(reason(B.start(), I())).toBe("no_base");
    expect(reason(B.start(), I(-1))).toBe("bad_base");
    expect(reason(after(I(3)), I(5))).toBe("base_order");
    expect(reason(after(I(3), I(4)), I(3))).toBe("base_order");
    expect(reason(after(I(0), I(1), I(2), I(3)), I(4))).toBe("max_bases");
    // repetir a última é permitido (puff)
    expect(reason(after(I(0), I(1)), I(1))).toBe("ok");
  });

  test("limite de alças", () => {
    let s = B.start();
    for (let i = 1; i < B.MAX_LOOPS; i++) s = (B.apply(s, Y) as { ok: true; state: B.BuilderState }).state;
    expect(s.loops.length).toBe(B.MAX_LOOPS);
    expect(reason(s, Y)).toBe("max_loops");
    expect(reason(s, I(0))).toBe("max_loops");
    expect(B.allowed(s).yo).toBe(false);
  });

  test("depois de finish tudo é recusado", () => {
    const s = run([Y, D(1), F]).state;
    for (const c of [Y, I(0), D(1), F]) expect(reason(s, c)).toBe("finished");
    expect(B.allowed(s)).toEqual({ yo: false, insert: false, drawMax: 0, finish: false });
  });
});

describe("allowed concorda com apply em cada passo de cada sequência", () => {
  test("yo, insert, drawMax e finish", () => {
    for (const row of TABLE) {
      let s = B.start();
      const check = () => {
        const a = B.allowed(s);
        expect(B.apply(s, Y).ok).toBe(a.yo);
        const bases = B.basesOf(s.cmds);
        expect(B.apply(s, I(bases[bases.length - 1] ?? 0)).ok).toBe(a.insert);
        let max = 0;
        for (let k = 1; k <= 20; k++) if (B.apply(s, D(k)).ok) max = k;
        expect(max).toBe(a.drawMax);
        expect(B.apply(s, F).ok).toBe(a.finish);
      };
      check();
      for (const c of row.cmds) {
        s = (B.apply(s, c) as { ok: true; state: B.BuilderState }).state;
        check();
      }
    }
  });
});

describe("pureza", () => {
  test("apply não altera a entrada; replay = passo a passo; undo = replay sem o último", () => {
    for (const row of TABLE) {
      let s = B.start();
      for (const c of row.cmds) {
        const before = structuredClone(s);
        const r = B.apply(s, c);
        expect(s).toEqual(before);
        s = (r as { ok: true; state: B.BuilderState }).state;
      }
      const rp = B.replay(row.cmds);
      expect(rp.ok).toBe(true);
      expect(rp.ok && rp.state).toEqual(s);
      const prev = B.replay(s.cmds.slice(0, -1));
      expect(prev.ok && B.undo(s)).toEqual(prev.ok && prev.state);
    }
  });

  test("replay devolve o índice do primeiro comando recusado", () => {
    const r = B.replay([I(0), D(5), Y]);
    expect(r).toEqual({ ok: false, reason: "k_too_big", at: 1 });
  });
});

describe("modos de inserção", () => {
  test("FLO fica guardado em modes e não muda mais nada", () => {
    const flo = B.summarize(run([I(0, "flo"), Y, D(2), F]).state);
    const both = B.summarize(run([I(0), Y, D(2), F]).state);
    expect(flo.modes).toEqual(["flo"]);
    expect(both.modes).toEqual(["both"]);
    expect({ ...flo, modes: [] }).toEqual({ ...both, modes: [] });
  });
});

describe("insertBases concorda com apply", () => {
  test("para cada prefixo das 9 sequências e cada tamanho de carreira, as bases aceitas são as de apply(insert)", () => {
    for (const row of TABLE) {
      let s = B.start();
      const states = [s];
      for (const c of row.cmds) {
        s = (B.apply(s, c) as { ok: true; state: B.BuilderState }).state;
        states.push(s);
      }
      for (const state of states) {
        for (let count = 1; count <= 8; count++) {
          const accepted = Array.from({ length: count }, (_, b) => b).filter((b) => B.apply(state, I(b)).ok);
          expect(B.insertBases(state, count), `${row.name} ${count}`).toEqual(accepted);
        }
      }
    }
  });

  test("sem base ainda: todas; com base: a última e a seguinte; limites de alças e de bases distintas", () => {
    expect(B.insertBases(B.start(), 5)).toEqual([0, 1, 2, 3, 4]);
    const s1 = run([I(2)]).state;
    expect(B.insertBases(s1, 5)).toEqual([2, 3]);
    expect(B.insertBases(s1, 3)).toEqual([2]);
    const s4 = run([I(0), I(1), I(2), I(3)]).state;
    expect(B.insertBases(s4, 8)).toEqual([3]);
    expect(B.insertBases(run([Y, D(1), F]).state, 5)).toEqual([]);
  });
});

describe("insertBases concorda com apply também em caminhadas aleatórias", () => {
  // gerador com semente (mulberry32); o fast-check não está instalado
  const rng = (seed: number) => {
    let a = seed >>> 0;
    return (): number => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  test("200 caminhadas de até 30 comandos (inclui chegar ao limite de alças): para cada prefixo e cada tamanho de carreira", () => {
    let reachedMax = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      let s = B.start();
      const len = 1 + Math.floor(r() * 30);
      for (let i = 0; i <= len; i++) {
        for (let count = 1; count <= 8; count++) {
          const accepted = Array.from({ length: count }, (_, b) => b).filter((b) => B.apply(s, I(b)).ok);
          expect(B.insertBases(s, count), `semente ${seed} passo ${i} carreira ${count}`).toEqual(accepted);
        }
        if (s.loops.length >= B.MAX_LOOPS) reachedMax++;
        const al = B.allowed(s);
        const options: B.Cmd[] = [];
        if (al.yo) options.push(Y);
        // mais inserções do que o normal, para chegar ao limite de alças e ao de bases
        const bases = B.basesOf(s.cmds);
        const last = bases[bases.length - 1];
        if (al.insert)
          options.push(
            I(last ?? Math.floor(r() * 4)),
            I(last ?? 0),
            ...(last === undefined ? [] : [I(last + 1)]),
          );
        for (let k = 1; k <= al.drawMax; k++) options.push(D(k));
        if (al.finish) options.push(F);
        // na maior parte das vezes só laçadas e inserções (para chegar ao limite de alças); às vezes puxa ou termina
        const growth = options.filter((c) => c.kind === "yo" || c.kind === "insert");
        const pool = growth.length > 0 && r() < 0.9 ? growth : options;
        const pick = pool[Math.floor(r() * pool.length)];
        if (!pick) break;
        const next = B.apply(s, pick);
        if (next.ok) s = next.state;
      }
    }
    expect(reachedMax).toBeGreaterThan(0);
  });
});
