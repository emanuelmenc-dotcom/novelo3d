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
import { labelOf } from "../src/timeline.ts";
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

  test("receita: texto igual não grava e edições seguidas da mesma peça formam uma feature só que reexecuta cada uma em ordem", () => {
    dispatch("points.info", { text: TEXT }); // motor construído e confirmado
    dispatch("parts.commitText", { id: "p1" }); // foco saiu sem mudar nada
    expect(timelineView().features).toEqual([]);
    dispatch("parts.setText", { id: "p1", text: `${TEXT}\nV4: 18 pb (18)` });
    dispatch("parts.commitText", { id: "p1" });
    dispatch("parts.setText", { id: "p1", text: `${TEXT}\nV4: 18 pb (18)\nV5: 18 pb (18)` });
    dispatch("parts.commitText", { id: "p1" });
    expect(methods()).toEqual(["group"]);
    expect(timelineView().features[0]?.items).toHaveLength(2);
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

describe("buracos de reexecução (revisão do advisor)", () => {
  test("gravar com o marcador voltado não repete ids de features que vêm depois", () => {
    dispatch("parts.instance", { id: "p1" }); // p2
    dispatch("paint.rows", { yarn: "B", from: 2, to: 2 });
    dispatch("parts.copy", { id: "p1" }); // p3
    dispatch("timeline.rollTo", { index: 1 });
    dispatch("parts.instance", { id: "p1" }); // novo: não pode ser p3
    dispatch("timeline.rollTo", { index: 4 });
    const found = ids();
    expect(new Set(found).size).toBe(found.length);
    expect(found).toHaveLength(4);
  });

  test("a seleção de pontos e o tutorial continuam depois de reexecutar", () => {
    dispatch("parts.instance", { id: "p1" });
    dispatch("selection.select", { text: TEXT, by: { kind: "group", from: 2, to: 2 } });
    dispatch("tutorial.goto", { text: TEXT, round: 2 });
    const sel = dispatch("selection.get", { text: TEXT, all: true }) as { uids: number[] };
    const tut = (dispatch("tutorial.get", { text: TEXT }) as { index: number }).index;
    replayTimeline();
    expect((dispatch("selection.get", { text: TEXT, all: true }) as { uids: number[] }).uids).toEqual(
      sel.uids,
    );
    expect((dispatch("tutorial.get", { text: TEXT }) as { index: number }).index).toBe(tut);
  });

  test("editar pontos de uma volta nova, com a receita digitada e sem confirmar, fica na ordem certa", () => {
    const novo = `${TEXT}
V4: (2 pb, 1 aum) x6 (24)`;
    dispatch("parts.setText", { id: "p1", text: novo });
    dispatch("selection.select", { text: novo, by: { kind: "group", from: 4, to: 4 } });
    dispatch("points.set", { text: novo, prop: "tension", value: 0.5 });
    // selection.select já confirmou a receita nova no motor: ela faz parte da base, só a edição de pontos é feature
    expect(methods()).toEqual(["points.set"]);
  });

  test("só o dialeto mudou: vira feature de receita", () => {
    dispatch("parts.instance", { id: "p1" });
    dispatch("points.info", { text: TEXT }); // motor construído e confirmado
    dispatch("parts.setText", { id: "p1", text: TEXT, dialect: "pt-BR" });
    dispatch("parts.commitText", { id: "p1" });
    expect(methods()).toEqual(["parts.instance", "parts.commitText"]);
  });

  test("duas inserções no meio da receita seguidas de edição de ponto reexecutam iguais (uids)", () => {
    const base = ["V1: 6 pb no anel mágico (6)", "V2: 6 aum (12)"];
    const a = [...base, "V3: 12 pb (12)", "V4: (1 pb, 1 aum) x6 (18)"].join("\n");
    const b = [...base, "V3: 12 pb (12)", "V4: 12 pb (12)", "V5: (1 pb, 1 aum) x6 (18)"].join("\n");
    dispatch("parts.instance", { id: "p1" });
    dispatch("points.info", { text: TEXT }); // motor com a receita de partida
    dispatch("parts.setText", { id: "p1", text: a });
    dispatch("parts.commitText", { id: "p1" });
    dispatch("parts.setText", { id: "p1", text: b });
    dispatch("parts.commitText", { id: "p1" });
    dispatch("selection.select", { text: b, by: { kind: "group", from: 4, to: 4 } });
    dispatch("points.set", { text: b, prop: "tension", value: -0.3 });
  });
});

describe("desfazer e refazer pela linha do tempo", () => {
  test("pintar, desfazer: a pintura some; refazer: volta (a pintura passa a ser desfazível)", () => {
    dispatch("paint.rows", { yarn: "B", from: 2, to: 2 });
    expect(rowsPainted()).toBeGreaterThan(0);
    dispatch("history.undo");
    expect(rowsPainted()).toBe(0);
    expect(dispatch("history.get")).toEqual({ canUndo: false, canRedo: true });
    dispatch("history.redo");
    expect(rowsPainted()).toBeGreaterThan(0);
    expect(() => dispatch("history.redo")).toThrow("nada para refazer");
  });

  test("desfazer sem nada é erro claro", () => {
    expect(() => dispatch("history.undo")).toThrow("nada para desfazer");
  });

  test("o tipo de costura e o fio novo ficam como eram quando a feature foi gravada", () => {
    dispatch("parts.instance", { id: "p1" });
    dispatch("selection.select", { text: TEXT, by: { kind: "group", from: 3, to: 3 } });
    dispatch("seam.draft", { side: "a" });
    dispatch("parts.setActive", { id: "p2" });
    dispatch("seam.draft", { side: "b" });
    dispatch("seam.add", {});
    dispatch("yarns.add", {});
    const type = (dispatch("seam.list") as { seams: { type: string }[] }).seams[0]?.type;
    const palette = JSON.stringify((dispatch("yarns.get") as { yarns: unknown[] }).yarns);
    dispatch("settings.set", { yarns: { seam: { type: "whip" } } });
    replayTimeline();
    expect((dispatch("seam.list") as { seams: { type: string }[] }).seams[0]?.type).toBe(type);
    expect(JSON.stringify((dispatch("yarns.get") as { yarns: unknown[] }).yarns)).toBe(palette);
    dispatch("settings.reset", {});
  });

  test("um traço de pincel que ficou aberto não engole as features seguintes", () => {
    dispatch("history.begin");
    dispatch("tool.brush", { text: TEXT, uid: 3, hops: 0, prop: "tension", value: 0.5 });
    dispatch("parts.instance", { id: "p1" }); // fecha o traço
    expect(methods()).toEqual(["group", "parts.instance"]);
  });
});

describe("arquivo do projeto", () => {
  test("a linha do tempo vai no arquivo e, ao abrir, o desfazer continua de onde estava", () => {
    dispatch("parts.instance", { id: "p1" });
    dispatch("paint.rows", { yarn: "B", from: 2, to: 2 });
    dispatch("history.undo");
    const file = JSON.parse(JSON.stringify(dispatch("project.export")));
    expect(file.timeline).toMatchObject({ version: 1, marker: 1 });
    resetParts(TEXT);
    expect(timelineView().features).toEqual([]);
    dispatch("project.import", { project: file });
    expect(methods()).toEqual(["parts.instance", "paint.rows"]);
    expect(timelineView().marker).toBe(1);
    expect(ids()).toEqual(["p1", "p2"]);
    dispatch("history.redo");
    expect(rowsPainted()).toBeGreaterThan(0);
    dispatch("history.undo");
    dispatch("history.undo");
    expect(ids()).toEqual(["p1"]);
  });

  test("arquivo antigo (sem linha do tempo) ou com ela estragada abre com a linha do tempo vazia", () => {
    dispatch("parts.instance", { id: "p1" });
    const file = JSON.parse(JSON.stringify(dispatch("project.export")));
    for (const bad of [
      undefined,
      null,
      5,
      { version: 9 },
      { version: 1, base: {}, features: [] },
      { ...file.timeline, features: [{ x: 1 }] },
    ]) {
      resetParts(TEXT);
      dispatch("project.import", { project: { ...file, timeline: bad } });
      expect(timelineView().features).toEqual([]);
      expect(ids()).toEqual(["p1", "p2"]); // o projeto abre do mesmo jeito
    }
  });

  test("tamanho do arquivo depois de 50 traços numa receita grande", () => {
    const rows = ["V1: 6 pb no anel mágico (6)", "V2: 6 aum (12)"];
    for (let i = 3; i <= 45; i++) rows.push(`V${i}: (${i - 2} pb, 1 aum) x6 (${6 * i})`);
    const big = rows.join("\n");
    resetParts(big);
    dispatch("points.info", { text: big });
    const last = (dispatch("points.info", { text: big }) as { lastUid: number }).lastUid;
    for (let k = 0; k < 50; k++) {
      dispatch("history.begin");
      for (let j = 0; j < 12; j++)
        dispatch("tool.brush", {
          text: big,
          uid: last - 10 - k * 20 - j,
          hops: 1,
          prop: "tension",
          value: 0.5,
        });
      dispatch("history.end");
    }
    const bytes = JSON.stringify(dispatch("project.export")).length;
    console.log(`arquivo com 50 traços: ${(bytes / 1024).toFixed(0)} KB`);
    expect(bytes).toBeLessThan(5_000_000);
  });
});

describe("revisão do G6", () => {
  test("receita meio digitada que o motor recusa não vira feature", () => {
    dispatch("parts.instance", { id: "p1" });
    dispatch("points.info", { text: TEXT });
    dispatch("parts.setText", { id: "p1", text: `${TEXT}${"\n"}V4: (2 pb, 1 ###` });
    const r = dispatch("parts.commitText", { id: "p1" }) as { committed: boolean };
    expect(r.committed).toBe(false);
    expect(methods()).toEqual(["parts.instance"]);
    dispatch("parts.setText", { id: "p1", text: TEXT });
  });

  test("seleção grande vira faixas e reexecuta igual", () => {
    dispatch("selection.select", { text: TEXT, by: { kind: "all" } });
    dispatch("points.set", { text: TEXT, prop: "tension", value: 0.3 });
    const target = timelineView().features[0]?.params.target as { kind: string; ranges: number[][] };
    expect(target.kind).toBe("uidRanges");
    expect(target.ranges.length).toBeLessThan(3);
  });

  test("depois de muitas features as mais antigas viram base e o desfazer das recentes continua", () => {
    dispatch("parts.instance", { id: "p1" });
    for (let i = 0; i < 230; i++) dispatch("parts.set", { id: i % 2 ? "p2" : "p1", pos: [i, 0, 0] });
    const t = timelineView();
    expect(t.features.length).toBeLessThanOrEqual(200);
    dispatch("history.undo");
    expect((dispatch("parts.get") as { parts: { pos: number[] }[] }).parts[1]?.pos[0]).toBe(227);
  });

  test("desfazer a criação da peça ativa devolve a edição para uma peça que existe", () => {
    dispatch("parts.add", { name: "X", text: TEXT }); // p2
    dispatch("parts.setActive", { id: "p2" });
    dispatch("history.undo");
    expect((dispatch("parts.get") as { active: string }).active).toBe("p1");
    dispatch("paint.rows", { yarn: "B", from: 2, to: 2 });
    expect((dispatch("paint.report", { text: TEXT }) as { changeCount: number }).changeCount).toBeGreaterThan(
      0,
    );
  });

  test("lados A e B do rascunho de costura continuam depois de desfazer", () => {
    dispatch("parts.instance", { id: "p1" });
    dispatch("selection.select", { text: TEXT, by: { kind: "group", from: 3, to: 3 } });
    dispatch("seam.draft", { side: "a" });
    dispatch("parts.copy", { id: "p1" });
    dispatch("history.undo");
    expect((dispatch("parts.get") as { draft: { a: unknown } }).draft.a).not.toBeNull();
  });
});

describe("ajustes seguidos viram uma feature só", () => {
  test("digitar um nome (8 teclas), arrastar a tensão padrão e a paleta não enchem a linha do tempo", () => {
    dispatch("parts.instance", { id: "p1" });
    for (const nome of ["A", "Al", "Alt", "Alta", "Altan", "Altane", "Altaner", "Altaneira"])
      dispatch("parts.set", { id: "p2", name: nome });
    for (let i = 0; i < 20; i++) dispatch("edit.setDefaultTension", { value: i / 20 });
    expect(methods()).toEqual(["parts.instance", "parts.set", "edit.setDefaultTension"]);
    expect((dispatch("parts.get") as { parts: { name: string }[] }).parts[1]?.name).toBe("Altaneira");
    // mexer em outro alvo ou em outro campo da mesma peça não junta com o anterior se for outro comando
    dispatch("parts.set", { id: "p1", pos: [1, 0, 0] });
    expect(methods()).toHaveLength(4);
  });

  test("a feature juntada reexecuta igual (valor do último ajuste)", () => {
    dispatch("parts.instance", { id: "p1" });
    dispatch("parts.set", { id: "p2", pos: [3, 0, 0] });
    dispatch("parts.set", { id: "p2", pos: [7, 0, 0] });
    dispatch("parts.set", { id: "p2", name: "Z" });
    replayTimeline();
    const p = (dispatch("parts.get") as { parts: { pos: number[]; name: string }[] }).parts[1];
    expect(p).toMatchObject({ pos: [7, 0, 0], name: "Z" });
  });
});

test("o nome de cada feature de peça e montagem é legível, não o nome do comando", () => {
  dispatch("parts.instance", { id: "p1" });
  dispatch("assembly.add", { parts: ["p2"] });
  dispatch("assembly.set", { id: "a1", pos: [5, 0, 0] });
  const labels = (dispatch("timeline.get") as { features: { label: string }[] }).features.map((f) => f.label);
  expect(labels).toEqual(["instância da peça p1", "nova montagem", "ajustar a montagem a1"]);
});

test("toda feature tem nome legível na faixa, diferente do nome do comando", () => {
  const feats = Object.entries(COMMAND_CLASS).filter(([, c]) => c === "feature");
  expect(feats.length).toBeGreaterThan(20);
  for (const [m] of feats) {
    const f = { method: m, params: {} } as unknown as Parameters<typeof labelOf>[0];
    expect(labelOf(f), m).not.toBe(m);
  }
});

test("pincel 'só na seleção' grava a seleção de quando foi feito: reexecutar com outra seleção pinta os mesmos pontos", () => {
  const edits = () =>
    JSON.stringify((dispatch("project.export") as { edit: { p1: { tension: unknown } } }).edit.p1.tension);
  // seleciona a volta 2 e passa o pincel com alcance grande, limitado à seleção
  dispatch("selection.select", { text: TEXT, by: { kind: "group", from: 2, to: 2 } });
  dispatch("tool.brush", { text: TEXT, uid: 8, hops: 5, prop: "tension", value: 0.5, onlySelection: true });
  const live = edits();
  // muda a seleção para a volta 3 e reexecuta: a pintura continua na volta 2
  dispatch("selection.select", { text: TEXT, by: { kind: "group", from: 3, to: 3 } });
  replayTimeline();
  expect(edits()).toBe(live);
  const f = timelineView().features.find((x) => x.method === "tool.brush");
  expect((f?.params.onlySelection as { kind: string }).kind).toBe("uidRanges");
});
