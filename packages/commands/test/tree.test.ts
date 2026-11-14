// SPDX-License-Identifier: GPL-3.0-or-later
// Árvore do projeto (G4): `tree.get`, `tree.select` e a visibilidade das peças (`parts.setVisible/isolate/showAll`).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { dispatch, partsSnapshot, resetParts, setTreeSelected } from "../src/index.ts";

const TEXT = "V1: 6 pb no anel mágico (6)\nV2: 6 aum (12)";
interface Node {
  id: string;
  kind: string;
  name: string;
  active: boolean;
  visible: boolean;
  source?: string | null;
  ok?: boolean;
}
interface Tree {
  selected: string | null;
  active: string;
  root: { id: string; kind: string; children: Node[] };
}
const tree = () => dispatch("tree.get") as Tree;
const refused = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return "ok";
};

beforeEach(() => {
  resetParts(TEXT);
  setTreeSelected(null);
});
afterEach(() => {
  resetParts("");
  setTreeSelected(null);
});

describe("tree.get", () => {
  test("uma raiz com a peça única, ativa e visível", () => {
    const t = tree();
    expect(t.root).toMatchObject({ id: "root", kind: "assembly" });
    expect(t.root.children).toEqual([
      { id: "p1", kind: "part", name: expect.any(String), active: true, visible: true, source: null },
    ]);
  });

  test("peças, instância, espelhada e costura entram com o tipo certo", () => {
    dispatch("parts.instance", { id: "p1" });
    dispatch("parts.mirror", { id: "p1", plane: "x" });
    const kinds = tree().root.children.map((n) => n.kind);
    expect(kinds).toEqual(["part", "instance", "mirror"]);
    expect(tree().root.children[1]?.source).toBe("p1");
  });
});

describe("tree.select", () => {
  test("selecionar uma peça a torna ativa; selecionar a raiz não muda a ativa", () => {
    dispatch("parts.instance", { id: "p1" });
    const second = tree().root.children[1]?.id as string;
    expect(dispatch("tree.select", { id: second })).toMatchObject({ selected: second, active: second });
    expect(partsSnapshot().active).toBe(second);
    expect(dispatch("tree.select", { id: "root" })).toMatchObject({ selected: "root", active: second });
  });

  test("id que não existe é recusado e a seleção continua", () => {
    dispatch("tree.select", { id: "p1" });
    expect(refused(() => dispatch("tree.select", { id: "zzz" }))).toContain("não está na árvore");
    expect(tree().selected).toBe("p1");
  });
});

describe("visibilidade", () => {
  beforeEach(() => {
    dispatch("parts.instance", { id: "p1" });
  });

  test("esconder tira a peça do layout, mas ela continua na árvore e nos materiais", () => {
    const before = dispatch("assembly.layout", {}) as { nodes: unknown[] };
    dispatch("parts.setVisible", { id: "p1", visible: false });
    expect(tree().root.children[0]?.visible).toBe(false);
    const after = dispatch("assembly.layout", {}) as {
      nodes: unknown[];
      parts: { id: string; count: number }[];
    };
    expect(after.nodes.length).toBe(before.nodes.length / 2);
    expect(after.parts.find((q) => q.id === "p1")?.count).toBe(0);
    // os materiais contam as duas peças mesmo com uma escondida
    const mats = JSON.stringify(dispatch("materials.list", {}));
    dispatch("parts.setVisible", { id: "p1", visible: true });
    expect(JSON.stringify(dispatch("materials.list", {}))).toBe(mats);
  });

  test("isolar deixa só uma peça; mostrar tudo as traz de volta; cada um é um passo do desfazer", () => {
    dispatch("parts.isolate", { id: "p1" });
    expect(tree().root.children.map((n) => n.visible)).toEqual([true, false]);
    dispatch("parts.showAll");
    expect(tree().root.children.map((n) => n.visible)).toEqual([true, true]);
    dispatch("history.undo"); // desfaz o "mostrar tudo" inteiro
    expect(tree().root.children.map((n) => n.visible)).toEqual([true, false]);
  });

  test("valores inválidos são recusados", () => {
    expect(refused(() => dispatch("parts.setVisible", { id: "p1", visible: "sim" }))).toContain(
      "verdadeiro ou falso",
    );
    expect(refused(() => dispatch("parts.isolate", { id: "zzz" }))).not.toBe("ok");
  });

  test("a visibilidade vai e volta no arquivo do projeto", () => {
    dispatch("parts.setVisible", { id: "p1", visible: false });
    const file = JSON.parse(JSON.stringify(dispatch("project.export")));
    resetParts(TEXT);
    dispatch("project.import", { project: file });
    expect(tree().root.children[0]?.visible).toBe(false);
  });
});
