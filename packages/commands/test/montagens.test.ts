// SPDX-License-Identifier: GPL-3.0-or-later
// Montagens (G5): agrupam peças e outras montagens, com posição e rotação próprias; apagar leva tudo o que há dentro.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { dispatch, resetParts, setTreeSelected } from "../src/index.ts";
import { expectReplayMatchesLive } from "./replay-check.ts";

const TEXT = "V1: 6 pb no anel mágico (6)\nV2: 6 aum (12)";
interface Node {
  id: string;
  kind: string;
  name: string;
  children?: Node[];
  pos?: number[];
  visible: boolean;
}
const tree = () => (dispatch("tree.get") as { root: { children: Node[] } }).root.children;
const refused = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return "ok";
};
const layout = () => dispatch("assembly.layout", {}) as { positions: number[]; nodes: { part: string }[] };
const centroid = (part: string): number[] => {
  const l = layout();
  const c = [0, 0, 0];
  let n = 0;
  l.nodes.forEach((nd, i) => {
    if (nd.part !== part) return;
    for (let k = 0; k < 3; k++) c[k] = (c[k] as number) + (l.positions[i * 3 + k] as number);
    n++;
  });
  return c.map((v) => v / n);
};

beforeEach(() => {
  resetParts(TEXT);
  setTreeSelected(null);
  dispatch("parts.instance", { id: "p1" }); // p2
});
afterEach(() => {
  expectReplayMatchesLive();
  resetParts("");
});

describe("criar", () => {
  test("sem peças a montagem nasce vazia; com peças, elas entram", () => {
    dispatch("assembly.add", {});
    dispatch("assembly.add", { name: "Cabeça", parts: ["p2"] });
    const t = tree();
    expect(t.map((n) => `${n.kind}:${n.id}`)).toEqual(["assembly:a1", "assembly:a2", "part:p1"]);
    expect(t[0]?.children).toEqual([]);
    expect(t[1]).toMatchObject({ name: "Cabeça", children: [{ id: "p2", kind: "instance" }] });
  });

  test("parts inexistente ou nome ruim são recusados", () => {
    expect(refused(() => dispatch("assembly.add", { parts: ["zzz"] }))).toContain("não existe");
    expect(refused(() => dispatch("assembly.add", { parts: "p1" }))).toContain("lista");
    expect(refused(() => dispatch("assembly.add", { name: "x".repeat(41) }))).toContain("nome");
  });

  test("uma peça entra e sai da montagem por parts.set", () => {
    dispatch("assembly.add", {});
    dispatch("parts.set", { id: "p2", assembly: "a1" });
    expect(tree()[0]?.children?.map((n) => n.id)).toEqual(["p2"]);
    dispatch("parts.set", { id: "p2", assembly: null });
    expect(tree()[0]?.children).toEqual([]);
    expect(refused(() => dispatch("parts.set", { id: "p2", assembly: "a9" }))).toContain("não existe");
  });
});

describe("posição e rotação", () => {
  test("mover a montagem move todas as peças dela, sem mudar a posição de cada uma", () => {
    dispatch("assembly.add", { parts: ["p1", "p2"] });
    const before = [centroid("p1"), centroid("p2")];
    dispatch("assembly.set", { id: "a1", pos: [10, 0, 5] });
    const after = [centroid("p1"), centroid("p2")];
    for (let i = 0; i < 2; i++) {
      const b = before[i] as number[];
      const f = after[i] as number[];
      // a posição é em mm e o 3D em larguras de ponto de 5 mm
      expect(f[0]).toBeCloseTo((b[0] as number) + 10 / 5, 5);
      expect(f[2]).toBeCloseTo((b[2] as number) + 5 / 5, 5);
    }
    expect((dispatch("parts.get") as { parts: { pos: number[] }[] }).parts[0]?.pos).toEqual([0, 0, 0]);
  });

  test("girar 180° em Z leva o centro da peça para o lado oposto", () => {
    dispatch("parts.set", { id: "p1", pos: [8, 0, 0] });
    const x0 = (centroid("p1") as number[])[0] as number;
    dispatch("assembly.add", { parts: ["p1"] });
    dispatch("assembly.set", { id: "a1", rot: [0, 0, 180] });
    expect((centroid("p1") as number[])[0]).toBeCloseTo(-(x0 ?? 0), 4);
  });

  test("montagem dentro de montagem soma as posições", () => {
    dispatch("assembly.add", { parts: ["p1"] });
    dispatch("assembly.add", { name: "Fora" });
    dispatch("assembly.set", { id: "a1", parent: "a2", pos: [1, 0, 0] });
    const before = (centroid("p1") as number[])[0] as number;
    dispatch("assembly.set", { id: "a2", pos: [4, 0, 0] });
    expect((centroid("p1") as number[])[0]).toBeCloseTo(before + 4 / 5, 5); // mm → larguras de ponto
  });

  test("não deixa uma montagem ficar dentro dela mesma", () => {
    dispatch("assembly.add", {});
    dispatch("assembly.add", { parent: "a1" });
    expect(refused(() => dispatch("assembly.set", { id: "a1", parent: "a2" }))).toContain(
      "dentro dela mesma",
    );
    expect(refused(() => dispatch("assembly.set", { id: "a1", parent: "a1" }))).toContain(
      "dentro dela mesma",
    );
  });

  test("esconder a montagem esconde as peças de dentro e fica fora do desfazer", () => {
    dispatch("assembly.add", { parts: ["p2"] });
    const n = layout().nodes.length;
    dispatch("assembly.setVisible", { id: "a1", visible: false });
    expect(layout().nodes.length).toBe(n / 2);
    dispatch("history.undo"); // desfaz a criação, não o esconder
    expect(tree().some((x) => x.kind === "assembly")).toBe(false);
  });
});

describe("apagar", () => {
  beforeEach(() => {
    dispatch("assembly.add", { name: "Grupo", parts: ["p2"] });
  });

  test("sem confirmar só diz o que sairia", () => {
    expect(dispatch("assembly.contents", { id: "a1" })).toEqual({
      assemblies: ["a1"],
      parts: ["p2"],
      seams: [],
    });
    expect(refused(() => dispatch("assembly.remove", { id: "a1" }))).toContain("confirm: true");
    expect(tree().some((n) => n.id === "a1")).toBe(true);
  });

  test("confirmado remove a montagem, as montagens de dentro, as peças e as costuras delas", () => {
    dispatch("assembly.add", { name: "Dentro", parent: "a1" });
    dispatch("selection.select", { text: TEXT, by: { kind: "group", from: 2, to: 2 } });
    dispatch("seam.draft", { side: "a" });
    dispatch("parts.setActive", { id: "p2" });
    dispatch("seam.draft", { side: "b" });
    dispatch("seam.add", {});
    expect((dispatch("assembly.contents", { id: "a1" }) as { seams: string[] }).seams).toHaveLength(1);
    dispatch("assembly.remove", { id: "a1", confirm: true });
    expect(tree().map((n) => n.id)).toEqual(["p1"]);
    expect((dispatch("seam.list") as { seams: unknown[] }).seams).toEqual([]);
    dispatch("history.undo");
    expect(tree().some((n) => n.id === "a1")).toBe(true);
  });

  test("não apaga a última peça do projeto nem uma peça que serve de origem de outra de fora", () => {
    dispatch("parts.set", { id: "p1", assembly: "a1" });
    dispatch("parts.set", { id: "p2", assembly: null });
    expect(refused(() => dispatch("assembly.remove", { id: "a1", confirm: true }))).toContain("usa uma peça");
    dispatch("parts.detach", { id: "p2" });
    dispatch("parts.set", { id: "p2", assembly: "a1" });
    expect(refused(() => dispatch("assembly.remove", { id: "a1", confirm: true }))).toContain(
      "pelo menos uma peça",
    );
  });
});

test("montagens vão e voltam no arquivo do projeto", () => {
  dispatch("assembly.add", { name: "Grupo", parts: ["p2"] });
  dispatch("assembly.set", { id: "a1", pos: [3, 2, 1], rot: [0, 0, 90] });
  const file = JSON.parse(JSON.stringify(dispatch("project.export")));
  resetParts(TEXT);
  dispatch("project.import", { project: file });
  expect(tree()[0]).toMatchObject({ id: "a1", name: "Grupo", pos: [3, 2, 1], children: [{ id: "p2" }] });
  dispatch("assembly.add", {});
  expect(tree().some((n) => n.id === "a2")).toBe(true); // o contador continua
});

test("projeto gravado antes das posições em mm abre convertido (pergunta 25 em docs/12)", () => {
  dispatch("parts.set", { id: "p1", pos: [3, 0, 1] });
  const file = JSON.parse(JSON.stringify(dispatch("project.export")));
  expect(file.parts.unit).toBe("mm");
  file.parts.unit = undefined; // como era antes: larguras de ponto
  file.timeline = undefined;
  dispatch("project.import", { project: file });
  const p1 = (dispatch("parts.get") as { parts: { id: string; pos: number[] }[] }).parts.find(
    (q) => q.id === "p1",
  );
  expect(p1?.pos).toEqual([15, 0, 5]); // 3 e 1 larguras de ponto de 5 mm
});
