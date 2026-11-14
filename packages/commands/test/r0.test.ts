// SPDX-License-Identifier: GPL-3.0-or-later
// R0: regressões dos uids (digitar a receita, inserir voltas, salvar sem abrir a peça, contexto aninhado).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  currentSlot,
  dispatch,
  exportEditAll,
  loadEdit,
  loadEditAll,
  loadPaint,
  resetParts,
} from "../src/index.ts";
import { withPart } from "../src/parts-store.ts";

const yarns = [
  { id: "A", name: "a", colorHex: "#5d6b3a" },
  { id: "B", name: "b", colorHex: "#f4f1e8" },
];

beforeEach(() => {
  loadPaint({});
  loadEdit({});
  dispatch("yarns.set", { yarns });
});
afterEach(() => {
  loadEdit({});
  resetParts("");
});

type Sel = { count: number; uids: number[] };
type Pt = { group: number; yarn: string };
const rounds = (n: number, tail = "") =>
  [
    "V1: 6 pb no anel mágico (6)",
    "V2: 6 aum (12)",
    "V3: 12 pb (12)",
    ...Array.from({ length: n - 3 }, (_, i) => `V${i + 4}: 12 pb (12)`),
    tail,
  ]
    .filter(Boolean)
    .join("\n");

describe("digitar a receita não perde os uids", () => {
  test("pintar a V8, digitar a receita tecla a tecla (inclusive texto inválido) e mudar a V3", () => {
    const base = [
      "V1: 6 pb no anel mágico (6)",
      "V2: 6 aum (12)",
      "V3: (1 pb, 1 aum) x6 (18)",
      "V4–12: 1 pb em cada ponto (18)",
    ].join("\n");
    const final = base.replace("V3: (1 pb, 1 aum) x6 (18)", "V3: (2 pb, 1 aum) x6 (24)");
    resetParts(base);
    const v8 = (dispatch("selection.select", { text: base, by: { kind: "group", from: 8 } }) as Sel).uids;
    expect(v8).toHaveLength(18);
    dispatch("points.set", { text: base, prop: "yarn", value: "B" });
    // digitação: prefixos do texto final (alguns inválidos, vazios, meio-escritos)
    for (let n = 0; n <= final.length; n += 3) {
      dispatch("selection.get", { text: final.slice(0, n) });
    }
    dispatch("selection.get", { text: "lixo ###" });
    for (const uid of v8) {
      const r = dispatch("tool.eyedropper", { text: final, uid, prop: "yarn" }) as { value: string };
      expect(r.value).toBe("B");
    }
    // e os uids continuam na volta 8 da receita nova
    expect((dispatch("points.get", { text: final, uid: v8[0] }) as Pt).group).toBe(8);
  });

  test("voltar a um texto já visto devolve os mesmos uids", () => {
    const a = rounds(10);
    const b = rounds(10, "V11: 12 pb (12)\nV12: 12 pb (12)");
    resetParts(a);
    const ua = (dispatch("selection.select", { text: a, by: { kind: "group", from: 5 } }) as Sel).uids;
    dispatch("selection.select", { text: b, by: { kind: "group", from: 5 } });
    const ub = (dispatch("selection.select", { text: a, by: { kind: "group", from: 5 } }) as Sel).uids;
    expect(ub).toEqual(ua);
  });
});

describe("realinhamento em dois níveis", () => {
  test("pintar as voltas 30–31, mudar a V3 e acrescentar 14 voltas no fim: a pintura fica nas voltas 30–31", () => {
    const base = rounds(40);
    const extra = Array.from({ length: 14 }, (_, i) => `V${41 + i}: 12 pb (12)`).join("\n");
    const final = `${base.replace("V3: 12 pb (12)", "V3: 6 aum (18)")}\n${extra}`;
    resetParts(base);
    dispatch("selection.select", { text: base, by: { kind: "group", from: 30, to: 31 } });
    dispatch("points.set", { text: base, prop: "yarn", value: "B" });
    const painted = dispatch("selection.select", {
      text: final,
      by: { kind: "filter", yarns: ["B"] },
    }) as Sel;
    expect(painted.count).toBe(24);
    const groups = new Set(
      painted.uids.map((u) => (dispatch("points.get", { text: final, uid: u }) as Pt).group),
    );
    expect([...groups].sort()).toEqual([30, 31]);
  });

  test("inserir uma volta igual no meio não desloca o que veio depois", () => {
    const base = rounds(12);
    const inserted = base.replace("V6: 12 pb (12)", "V6: 12 pb (12)\nV6: 12 pb (12)");
    resetParts(base);
    const u10 = (dispatch("selection.select", { text: base, by: { kind: "group", from: 10 } }) as Sel).uids;
    const after = dispatch("selection.select", { text: inserted, by: { kind: "uids", uids: u10 } }) as Sel;
    expect(after.count).toBe(12);
    const g = new Set(u10.map((u) => (dispatch("points.get", { text: inserted, uid: u }) as Pt).group));
    expect([...g]).toEqual([11]); // uma volta a mais antes dela
  });

  test("trocar pb por mpa em outra volta mantém os uids das voltas anteriores", () => {
    const a = ["V1: 6 pb no anel mágico (6)", "V2: 6 aum (12)", "V3: 12 pb (12)"].join("\n");
    const b = a.replace("V3: 12 pb (12)", "V3: 12 mpa (12)");
    resetParts(a);
    const before = (dispatch("selection.select", { text: a, by: { kind: "group", from: 2 } }) as Sel).uids;
    const after = (dispatch("selection.select", { text: b, by: { kind: "group", from: 2 } }) as Sel).uids;
    expect(after).toEqual(before);
  });
});

describe("salvar e carregar", () => {
  test("peça que não foi aberta nesta sessão mantém os uids gravados", () => {
    const text = "V1: 6 pb no anel mágico (6)";
    const saved = {
      p1: {
        yarn: [],
        tension: [],
        defaultTension: 0,
        selection: [],
        uids: { text, uids: [101, 102, 103, 104, 105, 106, 107], next: 108 },
      },
      p2: {
        yarn: [[5, 1]],
        tension: [],
        defaultTension: 0,
        selection: [],
        uids: { text, uids: [201, 202, 203, 204, 205, 206, 207], next: 208 },
      },
    };
    loadEditAll(JSON.parse(JSON.stringify(saved)), "p1");
    const out = exportEditAll();
    expect(out.p2?.uids).toEqual(saved.p2.uids);
    expect(out.p1?.uids).toEqual(saved.p1.uids);
    // e abrir a peça p1 realmente usa esses uids
    resetParts(text);
    loadEditAll(JSON.parse(JSON.stringify(saved)), "p1");
    const info = dispatch("points.info", { text }) as { firstUid: number; nextUid: number };
    expect(info.firstUid).toBe(101);
    expect(info.nextUid).toBe(108);
  });

  test("exportar não muda enquanto a digitação não é confirmada", () => {
    resetParts(rounds(6));
    dispatch("selection.select", { text: rounds(6), by: { kind: "group", from: 3 } });
    const before = JSON.stringify(exportEditAll());
    dispatch("selection.get", { text: rounds(4) });
    expect(JSON.stringify(exportEditAll())).toBe(before);
  });
});

describe("contexto aninhado", () => {
  test("withPart dentro de withPart volta, em cada nível, ao conjunto anterior", () => {
    resetParts(rounds(4));
    dispatch("parts.add", { name: "B", text: rounds(4) });
    dispatch("parts.add", { name: "C", text: rounds(4) });
    expect(currentSlot()).toBe("p1");
    const inner = withPart("p2", () => {
      const mid = currentSlot();
      const deep = withPart("p3", () => currentSlot());
      return [mid, deep, currentSlot()];
    });
    expect(inner).toEqual(["p2", "p3", "p2"]);
    expect(currentSlot()).toBe("p1");
    expect(() => withPart("p2", () => Promise.resolve(1) as unknown as number)).toThrow(/assíncrona/);
    expect(currentSlot()).toBe("p1");
  });
});

describe("uids únicos e next que nunca diminui", () => {
  test("sequência aleatória de edições de texto", () => {
    let seed = 12345;
    const rnd = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    resetParts(rounds(8));
    let text = rounds(8);
    let lastNext = 0;
    for (let i = 0; i < 40; i++) {
      const lines = text.split("\n");
      const k = Math.floor(rnd() * lines.length);
      const op = rnd();
      if (op < 0.4) lines.splice(k, 0, `V${k + 1}: ${rnd() < 0.5 ? "12 pb (12)" : "6 aum (18)"}`);
      else if (op < 0.7 && lines.length > 3) lines.splice(Math.max(2, k), 1);
      else lines[k] = lines[k]?.replace(/pb/, "mpa") ?? "";
      text = lines.join("\n");
      dispatch("parts.setText", { id: "p1", text });
      dispatch("parts.commitText", { id: "p1" });
      const all = (dispatch("selection.select", { text, by: { kind: "all" } }) as Sel).uids;
      expect(new Set(all).size).toBe(all.length);
      // o contador CONFIRMADO nunca regride (uids provisórios de texto não confirmado não são gravados)
      const committed = exportEditAll().p1?.uids?.next ?? 0;
      expect(committed).toBeGreaterThanOrEqual(lastNext);
      lastNext = committed;
    }
  });
});

describe("consumo", () => {
  const text = ["V1: 6 pb no anel mágico (6)", "V2: 6 aum (12)", "V3: 12 pb (12)"].join("\n");
  type Rep = { usage: { yarn: string; lengthM: number }[] };
  const lengthA = () =>
    (dispatch("paint.report", { text }) as Rep).usage.find((u) => u.yarn === "A")?.lengthM as number;

  test("tensão -1 (ponto 1,4x maior) gasta 1,4x mais fio; tensão 0 não muda", () => {
    resetParts(text);
    const base = lengthA();
    expect(base).toBeGreaterThan(0);
    dispatch("edit.setDefaultTension", { value: -1 });
    expect(lengthA() / base).toBeCloseTo(1.4, 2);
    dispatch("edit.setDefaultTension", { value: 0 });
    expect(lengthA()).toBeCloseTo(base, 6);
    // tensão só nos pontos da volta 3 muda só a parte deles
    dispatch("selection.select", { text, by: { kind: "group", from: 3 } });
    dispatch("points.set", { text, prop: "tension", value: -1 });
    const mixed = lengthA();
    expect(mixed).toBeGreaterThan(base);
    expect(mixed).toBeLessThan(base * 1.4);
  });

  test("a largura do ponto vem das configurações e a troca de fios da instância entra antes da soma", () => {
    resetParts(text);
    const base = lengthA();
    dispatch("settings.set", { yarns: { stitchWidthMm: 10 } });
    expect(lengthA() / base).toBeCloseTo(2, 2);
    expect(() => dispatch("settings.set", { yarns: { stitchWidthMm: 99 } })).toThrow(/entre 1 e 30/);
    dispatch("settings.set", { yarns: { stitchWidthMm: 5 } });
    dispatch("yarns.set", {
      yarns: [
        { id: "A", name: "a", colorHex: "#5d6b3a", thickness: { id: "cyc-3" } },
        { id: "B", name: "b", colorHex: "#f4f1e8", thickness: { id: "cyc-5" } },
      ],
    });
    dispatch("parts.instance", { id: "p1" });
    dispatch("parts.set", { id: "p2", yarnMap: { A: "B" } });
    const l = dispatch("materials.list") as { yarns: { id: string; lengthM: number }[] };
    const a = l.yarns.find((y) => y.id === "A")?.lengthM as number;
    const b = l.yarns.find((y) => y.id === "B")?.lengthM as number;
    expect(b / a).toBeCloseTo(3.5 / 2, 2); // o fio B (mais grosso) gasta proporcionalmente mais
  });
});

describe("desfazer", () => {
  const text = ["V1: 6 pb no anel mágico (6)", "V2: 6 aum (12)", "V3: 12 pb (12)", "V4: 12 pb (12)"].join(
    "\n",
  );
  const yarnOf = (uid: number) =>
    (dispatch("tool.eyedropper", { text, uid, prop: "yarn" }) as { value: string }).value;

  test("um traço de pincel (30 pinceladas) é um passo só", () => {
    resetParts(text);
    dispatch("history.begin", {});
    for (let uid = 8; uid < 38; uid++)
      dispatch("tool.brush", { text, uid, hops: 0, prop: "yarn", value: "B" });
    dispatch("history.end", {});
    expect(yarnOf(8)).toBe("B");
    expect(yarnOf(37)).toBe("B");
    dispatch("history.undo", {});
    expect(yarnOf(8)).toBe("A");
    expect(yarnOf(37)).toBe("A");
    expect(() => dispatch("history.undo", {})).toThrow(/nada para desfazer/);
    dispatch("history.redo", {});
    expect(yarnOf(20)).toBe("B");
  });

  test("peças e costuras entram no desfazer, na ordem em que aconteceram", () => {
    resetParts(text);
    dispatch("tool.brush", { text, uid: 8, hops: 0, prop: "yarn", value: "B" });
    dispatch("parts.instance", { id: "p1" });
    expect((dispatch("parts.get", {}) as { parts: unknown[] }).parts).toHaveLength(2);
    expect((dispatch("history.get", {}) as { canUndo: boolean }).canUndo).toBe(true);
    dispatch("history.undo", {}); // desfaz a instância primeiro
    expect((dispatch("parts.get", {}) as { parts: unknown[] }).parts).toHaveLength(1);
    expect(yarnOf(8)).toBe("B");
    dispatch("history.undo", {}); // depois o fio
    expect(yarnOf(8)).toBe("A");
    dispatch("history.redo", {});
    dispatch("history.redo", {});
    expect((dispatch("parts.get", {}) as { parts: unknown[] }).parts).toHaveLength(2);
  });

  test("remover uma peça e desfazer traz de volta a peça com as suas edições", () => {
    resetParts(text);
    dispatch("parts.add", { name: "B", text });
    dispatch("parts.setActive", { id: "p2" });
    dispatch("tool.brush", { text, uid: 8, hops: 0, prop: "yarn", value: "B" });
    dispatch("parts.setActive", { id: "p1" });
    dispatch("parts.remove", { id: "p2" });
    dispatch("history.undo", {});
    dispatch("parts.setActive", { id: "p2" });
    expect(yarnOf(8)).toBe("B");
  });

  test("fechar a montagem é um passo só e o desfazer devolve poses e sentido das costuras", () => {
    resetParts(text);
    dispatch("parts.instance", { id: "p1" });
    dispatch("parts.set", { id: "p2", pos: [20, 15, -9], rot: [10, 20, 30] });
    dispatch("selection.select", { text, by: { kind: "group", from: 4 } });
    dispatch("seam.draft", { side: "a" });
    dispatch("parts.setActive", { id: "p2" });
    dispatch("seam.draft", { side: "b" });
    dispatch("seam.add", {});
    const poseBefore = JSON.stringify(
      (dispatch("parts.get", {}) as { parts: { pos: number[]; rot: number[] }[] }).parts.map((q) => [
        q.pos,
        q.rot,
      ]),
    );
    const r = dispatch("assembly.close", {}) as { before: unknown; seamReverse: Record<string, boolean> };
    const moved = JSON.stringify(
      (dispatch("parts.get", {}) as { parts: { pos: number[]; rot: number[] }[] }).parts.map((q) => [
        q.pos,
        q.rot,
      ]),
    );
    expect(moved).not.toBe(poseBefore);
    dispatch("assembly.undoClose", r);
    const back = JSON.stringify(
      (dispatch("parts.get", {}) as { parts: { pos: number[]; rot: number[] }[] }).parts.map((q) => [
        q.pos,
        q.rot,
      ]),
    );
    expect(back).toBe(poseBefore);
    // e pelo histórico geral: um único passo desfaz todo o fechamento
    dispatch("assembly.close", {});
    dispatch("history.undo", {});
    const viaHistory = JSON.stringify(
      (dispatch("parts.get", {}) as { parts: { pos: number[]; rot: number[] }[] }).parts.map((q) => [
        q.pos,
        q.rot,
      ]),
    );
    expect(viaHistory).toBe(poseBefore);
  });
});

describe("achados da revisão do R0", () => {
  const text = ["V1: 6 pb no anel mágico (6)", "V2: 6 aum (12)", "V3: 12 pb (12)", "V4: 12 pb (12)"].join(
    "\n",
  );
  type Sel = { count: number; uids: number[] };

  test("desfazer logo depois de digitar a receita desfaz a digitação e não o movimento da peça", () => {
    resetParts(text);
    dispatch("parts.instance", { id: "p1" });
    dispatch("parts.set", { id: "p2", pos: [5, 0, 0] });
    const novo = `${text}\nV5: 12 pb (12)`;
    dispatch("parts.setText", { id: "p1", text: novo });
    dispatch("history.undo", {}); // a receita digitada virou uma feature: é ela que sai
    const parts = dispatch("parts.get", {}) as { parts: { id: string; pos: number[] }[] };
    expect(parts.parts).toHaveLength(2);
    expect(parts.parts[1]?.pos).toEqual([5, 0, 0]); // o movimento continua
    const lay = dispatch("assembly.layout", {}) as { nodes: { part: string }[] };
    expect(lay.nodes.filter((n) => n.part === "p1")).toHaveLength(1 + 6 + 12 + 12 + 12); // sem a V5
  });

  test("depois de recarregar, o casamento em dois níveis continua valendo", () => {
    const base = Array.from({ length: 20 }, (_, i) =>
      i === 0 ? "V1: 6 pb no anel mágico (6)" : `V${i + 1}: 6 aum (12)`,
    ).join("\n");
    const seq = [
      "V1: 6 pb no anel mágico (6)",
      ...Array.from({ length: 19 }, (_, i) => `V${i + 2}: 6 pb (6)`),
    ].join("\n");
    void base;
    resetParts(seq);
    dispatch("selection.select", { text: seq, by: { kind: "group", from: 15, to: 16 } });
    dispatch("points.set", { text: seq, prop: "yarn", value: "B" });
    const saved = JSON.parse(JSON.stringify(exportEditAll()));
    loadEditAll(saved, "p1");
    const final = `${seq.replace("V3: 6 pb (6)", "V3: 6 pb (6) \nV3: 6 pb (6)")}`;
    const painted = dispatch("selection.select", {
      text: final,
      by: { kind: "filter", yarns: ["B"] },
    }) as Sel;
    expect(painted.count).toBe(12);
    const groups = new Set(
      painted.uids.map((u) => (dispatch("points.get", { text: final, uid: u }) as { group: number }).group),
    );
    expect([...groups].sort((a, b) => a - b)).toEqual([16, 17]); // uma volta a mais antes: 15–16 viram 16–17
  });

  test("voltar a um texto antigo não reutiliza uids já dados", () => {
    const a = "V1: 6 pb no anel mágico (6)\nV2: 6 aum (12)";
    const b = `${a}\nV3: 12 pb (12)`;
    const c = `${b}\nV4: 12 pb (12)`;
    resetParts(a);
    for (const t of [a, b, a, c]) dispatch("selection.select", { text: t, by: { kind: "all" } });
    const uids = (dispatch("selection.select", { text: c, by: { kind: "all" } }) as Sel).uids;
    expect(new Set(uids).size).toBe(uids.length);
    expect(exportEditAll().p1?.uids?.next).toBeGreaterThan(Math.max(...uids));
  });

  test("texto com erro não é confirmado", () => {
    resetParts(text);
    dispatch("selection.select", { text, by: { kind: "group", from: 3 } });
    const before = JSON.stringify(exportEditAll().p1?.uids);
    // editar pontos sobre receita com erro é recusado (senão gravaria uids provisórios)
    expect(() =>
      dispatch("selection.select", { text: "isto não é uma receita ###", by: { kind: "all" } }),
    ).toThrow(/corrija-a/);
    expect(() =>
      dispatch("points.set", { text: "isto não é uma receita ###", prop: "yarn", value: "B" }),
    ).toThrow(/corrija-a/);
    expect(JSON.stringify(exportEditAll()).includes("isto não")).toBe(false);
    expect(JSON.stringify(exportEditAll().p1?.uids)).toBe(before);
  });

  test("ação nova com o marcador voltado entra no marcador e o que vinha depois continua (D-68)", () => {
    resetParts(text);
    dispatch("tool.brush", { text, uid: 8, hops: 0, prop: "yarn", value: "B" });
    dispatch("history.undo", {});
    expect((dispatch("history.get", {}) as { canRedo: boolean }).canRedo).toBe(true);
    dispatch("parts.add", { name: "X", text });
    expect((dispatch("history.get", {}) as { canRedo: boolean }).canRedo).toBe(true);
  });
});

describe("terceira rodada da revisão do R0", () => {
  const text = ["V1: 6 pb no anel mágico (6)", "V2: 6 aum (12)", "V3: 12 pb (12)"].join("\n");
  test("parts.commitText de peça não ativa deixa o estado da peça ativa na interface", () => {
    resetParts(text);
    dispatch("parts.add", { name: "B", text });
    dispatch("selection.select", { text, by: { kind: "group", from: 2 } }); // p1 ativa, 12 selecionados
    const antes = (dispatch("edit.get", {}) as { selected: number }).selected;
    expect(antes).toBe(12);
    dispatch("parts.commitText", { id: "p2" });
    expect((dispatch("edit.get", {}) as { selected: number }).selected).toBe(antes);
  });
});

test("seam.draft recusa receita com erro", () => {
  const ok = ["V1: 6 pb no anel mágico (6)", "V2: 6 aum (12)"].join("\n");
  resetParts(ok);
  dispatch("selection.select", { text: ok, by: { kind: "group", from: 2 } });
  dispatch("parts.setText", { id: "p1", text: "V1: 6 pb no anel mágico (6)\nV2: lixo ### (12)" });
  expect(() => dispatch("seam.draft", { side: "a" })).toThrow(/corrija-a/);
});
