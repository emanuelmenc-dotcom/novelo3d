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
