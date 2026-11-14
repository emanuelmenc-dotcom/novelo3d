// SPDX-License-Identifier: GPL-3.0-or-later
// Linha do tempo (G6): classificação dos comandos, gravação e reexecução igual ao estado ao vivo.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  COMMAND_CLASS,
  commands,
  dispatch,
  replayTimeline,
  resetParts,
  setTreeSelected,
  timelineView,
} from "../src/index.ts";
import { expectReplayMatchesLive } from "./replay-check.ts";

const TEXT = "V1: 6 pb no anel mágico (6)\nV2: 6 aum (12)\nV3: (1 pb, 1 aum) x6 (18)";
const methods = () => timelineView().features.map((f) => f.method);

beforeEach(() => {
  resetParts(TEXT);
  setTreeSelected(null);
});
afterEach(() => {
  expectReplayMatchesLive();
  resetParts("");
});

describe("classificação", () => {
  test("todo comando tem classe e toda classe é de um comando que existe", () => {
    expect(Object.keys(commands).filter((k) => !COMMAND_CLASS[k])).toEqual([]);
    expect(Object.keys(COMMAND_CLASS).filter((k) => !commands[k])).toEqual([]);
  });
});

describe("gravação", () => {
  test("só features entram; consultas e sessão não", () => {
    dispatch("parts.get");
    dispatch("tree.select", { id: "p1" });
    dispatch("selection.select", { text: TEXT, by: { kind: "group", from: 2, to: 2 } });
    expect(timelineView().features).toEqual([]);
    dispatch("parts.instance", { id: "p1" });
    expect(methods()).toEqual(["parts.instance"]);
  });

  test("comando que falha não grava", () => {
    expect(() => dispatch("parts.instance", { id: "zzz" })).toThrow();
    expect(timelineView().features).toEqual([]);
  });

  test("receita: texto igual não grava e edições seguidas da mesma peça viram uma feature só", () => {
    dispatch("parts.commitText", { id: "p1" }); // foco saiu sem mudar nada
    expect(timelineView().features).toEqual([]);
    dispatch("parts.setText", { id: "p1", text: `${TEXT}\nV4: 18 pb (18)` });
    dispatch("parts.commitText", { id: "p1" });
    dispatch("parts.setText", { id: "p1", text: `${TEXT}\nV4: 18 pb (18)\nV5: 18 pb (18)` });
    dispatch("parts.commitText", { id: "p1" });
    expect(methods()).toEqual(["parts.commitText"]);
  });

  test("um traço de pincel (history.begin...end) é uma feature só", () => {
    dispatch("history.begin");
    dispatch("tool.brush", { text: TEXT, uid: 3, hops: 0, prop: "tension", value: 0.5 });
    dispatch("tool.brush", { text: TEXT, uid: 4, hops: 0, prop: "tension", value: 0.5 });
    dispatch("history.end");
    expect(methods()).toEqual(["group"]);
    expect(timelineView().features[0]?.items).toHaveLength(2);
  });
});

describe("reexecução igual ao ao vivo", () => {
  test("peças, montagem, pintura e edições por ponto", () => {
    dispatch("parts.instance", { id: "p1" });
    dispatch("assembly.add", { name: "Grupo", parts: ["p2"] });
    dispatch("assembly.set", { id: "a1", pos: [5, 0, 0] });
    dispatch("paint.rows", { yarn: "B", from: 2, to: 2 });
    dispatch("selection.select", { text: TEXT, by: { kind: "group", from: 3, to: 3 } });
    dispatch("points.set", { text: TEXT, prop: "tension", value: -0.5 });
    dispatch("edit.setDefaultTension", { value: 0.2 });
    dispatch("parts.set", { id: "p2", pos: [30, 0, 0] });
    expect(timelineView().features.length).toBe(7);
  });

  test("costura com os lados do rascunho", () => {
    dispatch("parts.instance", { id: "p1" });
    dispatch("selection.select", { text: TEXT, by: { kind: "group", from: 3, to: 3 } });
    dispatch("seam.draft", { side: "a" });
    dispatch("parts.setActive", { id: "p2" });
    dispatch("seam.draft", { side: "b" });
    dispatch("seam.add", {});
    dispatch("assembly.close", {});
    expect(methods()).toEqual(["parts.instance", "seam.add", "assembly.close"]);
  });

  test("apagar e criar de novo reaproveita os mesmos ids na reexecução", () => {
    dispatch("parts.instance", { id: "p1" }); // p2
    dispatch("parts.remove", { id: "p2" });
    dispatch("parts.copy", { id: "p1" }); // p3
    replayTimeline();
    expect((dispatch("parts.get") as { parts: { id: string }[] }).parts.map((p) => p.id)).toEqual([
      "p1",
      "p3",
    ]);
  });
});

interface Out {
  marker: number;
  total: number;
  canUndo: boolean;
  canRedo: boolean;
  features: {
    id: number;
    method: string;
    status: string;
    suppressed: boolean;
    error: string | null;
    inEffect: boolean;
  }[];
}
const tl = () => dispatch("timeline.get") as Out;
const ids = () => (dispatch("parts.get") as { parts: { id: string }[] }).parts.map((p) => p.id);
const rowsPainted = () => (dispatch("paint.report", { text: TEXT }) as { changeCount: number }).changeCount;

describe("operações", () => {
  beforeEach(() => {
    dispatch("parts.instance", { id: "p1" }); // 0: p2
    dispatch("paint.rows", { yarn: "B", from: 2, to: 2 }); // 1
    dispatch("parts.copy", { id: "p1" }); // 2: p3
  });

  test("rollTo volta o marcador e reexecuta só até ali; avançar traz tudo de novo", () => {
    dispatch("timeline.rollTo", { index: 1 });
    expect(ids()).toEqual(["p1", "p2"]);
    expect(tl()).toMatchObject({ marker: 1, total: 3, canUndo: true, canRedo: true });
    dispatch("timeline.rollTo", { index: 0 });
    expect(ids()).toEqual(["p1"]);
    dispatch("timeline.rollTo", { index: 3 });
    expect(ids()).toEqual(["p1", "p2", "p3"]);
    expect(() => dispatch("timeline.rollTo", { index: 9 })).toThrow("entre 0 e 3");
  });

  test("uma feature nova entra no marcador e as de depois dele continuam", () => {
    dispatch("timeline.rollTo", { index: 1 });
    dispatch("parts.set", { id: "p2", pos: [9, 0, 0] });
    expect(methods()).toEqual(["parts.instance", "parts.set", "paint.rows", "parts.copy"]);
    expect(tl().marker).toBe(2);
    dispatch("timeline.rollTo", { index: 4 });
    expect(ids()).toEqual(["p1", "p2", "p3"]);
  });

  test("suprimir uma feature a tira do projeto; as que dependem dela falham e o resto continua", () => {
    dispatch("parts.set", { id: "p2", pos: [9, 0, 0] }); // 3: depende de p2
    dispatch("timeline.suppress", { id: tl().features[0]?.id });
    const t = tl();
    expect(t.features[0]?.suppressed).toBe(true);
    expect(t.features[3]).toMatchObject({ status: "failed" });
    expect(t.features[3]?.error).toContain("não existe");
    expect(ids()).toEqual(["p1", "p3"]); // a cópia (feature 2) continua, com o id que tinha
    dispatch("timeline.suppress", { id: t.features[0]?.id }); // alterna: liga de novo
    expect(tl().features.every((f) => f.status === "ok")).toBe(true);
    expect(ids()).toEqual(["p1", "p2", "p3"]);
  });

  test("remover apaga a feature e reexecuta", () => {
    dispatch("timeline.remove", { id: tl().features[2]?.id });
    expect(methods()).toEqual(["parts.instance", "paint.rows"]);
    expect(ids()).toEqual(["p1", "p2"]);
    expect(tl().marker).toBe(2);
    expect(() => dispatch("timeline.remove", { id: 999 })).toThrow("não existe");
  });

  test("editar parâmetros muda o resultado", () => {
    const paint = tl().features[1];
    const before = rowsPainted();
    const r = dispatch("timeline.edit", { id: paint?.id, params: { from: 1, to: 3 } }) as {
      features: { params?: Record<string, unknown> }[];
    };
    expect(r.features[1]?.params).toMatchObject({ from: 1, to: 3, yarn: "B" });
    expect(rowsPainted()).not.toBe(before);
    expect(() => dispatch("timeline.edit", { id: paint?.id, params: "x" })).toThrow("objeto");
  });

  test("texto digitado e não confirmado vira feature antes de uma operação", () => {
    dispatch("parts.setText", {
      id: "p1",
      text: `${TEXT}
V4: 18 pb (18)`,
    });
    dispatch("timeline.rollTo", { index: 2 });
    expect(methods()).toContain("parts.commitText");
    expect((dispatch("parts.get") as { parts: { id: string }[] }).parts.length).toBeGreaterThan(0);
  });
});
