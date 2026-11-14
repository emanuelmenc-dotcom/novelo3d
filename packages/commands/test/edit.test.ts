// SPDX-License-Identifier: GPL-3.0-or-later
// Edição por ponto via comandos: uids, seleção, ferramentas, tensão no layout, histórico e persistência.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { dispatch, exportEdit, loadEdit, loadPaint, resetPaint } from "../src/index.ts";
import { expectReplayMatchesLive } from "./replay-check.ts";

const BOLA = [
  "V1: 6 pb no anel mágico (6)",
  "V2: 6 aum (12)",
  "V3: (1 pb, 1 aum) x6 (18)",
  "V4: (2 pb, 1 aum) x6 (24)",
  "V5: 24 pb (24)",
].join("\n");
const MAIS = `${BOLA}\nV6: 24 pb (24)`;
// inserir uma volta de pontos no começo muda a numeração das voltas mas não a identidade dos pontos
const text = BOLA;

type Sel = { count: number; uids: number[]; byGroup: { group: number; count: number }[] };
type Edit = { edit: { canUndo: boolean; canRedo: boolean; yarnOverrides: number; tensionOverrides: number } };

beforeEach(() => {
  loadEdit({});
  loadPaint({});
});
afterEach(() => {
  expectReplayMatchesLive();
  loadEdit({});
  resetPaint();
});

describe("pontos e seleção", () => {
  test("points.info e points.get", () => {
    const i = dispatch("points.info", { text }) as {
      points: number;
      groups: number;
      firstUid: number;
      lastUid: number;
    };
    expect(i).toMatchObject({ points: 1 + 6 + 12 + 18 + 24 + 24, groups: 5, firstUid: 1 });
    const pt = dispatch("points.get", { text, uid: 8 }) as { group: number; code: string; yarn: string };
    expect(pt).toMatchObject({ group: 2, yarn: "A" });
  });
  test("seleciona volta, soma, tira, inverte", () => {
    let s = dispatch("selection.select", { text, by: { kind: "group", from: 2 } }) as Sel;
    expect(s.count).toBe(12);
    s = dispatch("selection.select", { text, by: { kind: "group", from: 3 }, op: "add" }) as Sel;
    expect(s.count).toBe(30);
    s = dispatch("selection.select", { text, by: { kind: "group", from: 2 }, op: "remove" }) as Sel;
    expect(s.count).toBe(18);
    s = dispatch("selection.invert", { text }) as Sel;
    expect(s.count).toBe(1 + 6 + 12 + 24 + 24);
    dispatch("selection.clear");
    expect((dispatch("selection.get", { text }) as Sel).count).toBe(0);
  });
  test("cadeia linear: volta fechada e vizinhança em Y", () => {
    dispatch("selection.select", { text, by: { kind: "group", from: 1 } });
    expect(dispatch("selection.chain", { text })).toMatchObject({ linear: true, closed: true, count: 6 });
    dispatch("selection.select", { text, by: { kind: "uids", uids: [2, 3, 4] } });
    expect(dispatch("selection.chain", { text })).toMatchObject({ linear: true, closed: false });
    dispatch("selection.select", { text, by: { kind: "neighborhood", uid: 8, hops: 1 } });
    expect(dispatch("selection.chain", { text })).toMatchObject({ linear: false });
  });
  test("formas 3D usam o layout; laço usa a projeção enviada", () => {
    const all = dispatch("selection.select", {
      text,
      by: { kind: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 1e6 },
    }) as Sel;
    expect(all.count).toBe(1 + 6 + 12 + 18 + 24 + 24);
    const n = all.count;
    const xy = Array.from({ length: n * 2 }, (_, k) => (k % 2 === 0 ? Math.floor(k / 2) : 0));
    const r = dispatch("selection.screen", {
      text,
      xy,
      shape: { kind: "rect", x0: -0.5, y0: -1, x1: 4.5, y1: 1 },
    }) as Sel;
    expect(r.count).toBe(5);
  });
});

describe("ferramentas e histórico", () => {
  test("pintar a seleção com o fio B aparece em chart e relatório; desfazer reverte", () => {
    dispatch("yarns.set", {
      yarns: [
        { id: "A", name: "a", colorHex: "#5d6b3a" },
        { id: "B", name: "b", colorHex: "#f4f1e8" },
      ],
    });
    dispatch("selection.select", { text, by: { kind: "group", from: 3 } });
    const r = dispatch("points.set", { text, prop: "yarn", value: "B" }) as Edit & { changed: number };
    expect(r.changed).toBe(18);
    const rep = dispatch("paint.report", { text }) as { usage: { yarn: string }[] };
    expect(rep.usage.map((u) => u.yarn)).toContain("B");
    expect((dispatch("tool.eyedropper", { text, uid: 20, prop: "yarn" }) as { value: string }).value).toBe(
      "B",
    );
    dispatch("history.undo");
    expect((dispatch("tool.eyedropper", { text, uid: 20, prop: "yarn" }) as { value: string }).value).toBe(
      "A",
    );
    dispatch("history.redo");
    expect((dispatch("tool.eyedropper", { text, uid: 20, prop: "yarn" }) as { value: string }).value).toBe(
      "B",
    );
  });
  test("pincel e balde", () => {
    dispatch("yarns.set", {
      yarns: [
        { id: "A", name: "a", colorHex: "#5d6b3a" },
        { id: "B", name: "b", colorHex: "#f4f1e8" },
      ],
    });
    const b = dispatch("tool.brush", { text, uid: 20, hops: 1, prop: "yarn", value: "B" }) as {
      changed: number;
    };
    expect(b.changed).toBeGreaterThan(3);
    const k = dispatch("tool.bucket", { text, uid: 20, prop: "yarn", value: "A" }) as { changed: number };
    expect(k.changed).toBe(b.changed);
  });
  test("listras 2A/1B por volta", () => {
    dispatch("yarns.set", {
      yarns: [
        { id: "A", name: "a", colorHex: "#5d6b3a" },
        { id: "B", name: "b", colorHex: "#f4f1e8" },
      ],
    });
    dispatch("selection.select", { text, by: { kind: "group", from: 1, to: 5 } });
    dispatch("tool.stripes", {
      text,
      pattern: [
        ["A", 2],
        ["B", 1],
      ],
    });
    const at = (uid: number) =>
      (dispatch("tool.eyedropper", { text, uid, prop: "yarn" }) as { value: string }).value;
    expect(at(2)).toBe("A");
    expect(at(8)).toBe("A");
    expect(at(20)).toBe("B");
    expect(() =>
      dispatch("tool.stripes", { text, target: { kind: "uids", uids: [] }, pattern: [["A", 1]] }),
    ).toThrow(/nenhum ponto/);
  });
  test("tensão: padrão, edição, limites e tamanho no layout 3D", () => {
    expect(() => dispatch("edit.setDefaultTension", { value: 2 })).toThrow(/entre/);
    dispatch("selection.select", { text, by: { kind: "group", from: 4, to: 5 } });
    dispatch("points.set", { text, prop: "tension", value: -1 });
    const lay = dispatch("graph.layout", { text, include: true }) as {
      nodes: { uid: number; size: number }[];
      positions: number[];
      edges: number[];
    };
    const g4 = lay.nodes.find((n) => n.uid === 40);
    expect(g4?.size).toBeCloseTo(1.4);
    expect(lay.nodes.find((n) => n.uid === 2)?.size).toBeCloseTo(1);
    // arestas entre pontos frouxos (voltas 4-5) são maiores que entre os normais (voltas 2-3)
    const len = (a: number, b: number) =>
      Math.hypot(
        ...[0, 1, 2].map((k) => (lay.positions[a * 3 + k] as number) - (lay.positions[b * 3 + k] as number)),
      );
    const mean = (pick: (g: number) => boolean) => {
      let s = 0;
      let c = 0;
      for (let e = 0; e < lay.edges.length; e += 2) {
        const a = lay.edges[e] as number;
        const b = lay.edges[e + 1] as number;
        const ga = lay.nodes[a]?.uid ?? 0;
        const gb = lay.nodes[b]?.uid ?? 0;
        if (pick(ga) && pick(gb)) {
          s += len(a, b);
          c++;
        }
      }
      return s / c;
    };
    expect(mean((u) => u >= 32) / mean((u) => u >= 8 && u <= 25)).toBeGreaterThan(1.15);
  });
  test("pintura por ponto acompanha os pontos quando a receita ganha voltas", () => {
    dispatch("yarns.set", {
      yarns: [
        { id: "A", name: "a", colorHex: "#5d6b3a" },
        { id: "B", name: "b", colorHex: "#f4f1e8" },
      ],
    });
    dispatch("tool.brush", { text, uid: 20, hops: 0, prop: "yarn", value: "B" });
    const nova = MAIS;
    expect(
      (dispatch("tool.eyedropper", { text: nova, uid: 20, prop: "yarn" }) as { value: string }).value,
    ).toBe("B");
    expect((dispatch("points.info", { text: nova }) as { lastUid: number }).lastUid).toBe(
      (dispatch("points.info", { text }) as { lastUid: number }).lastUid + 24,
    );
  });
  test("persistência: exporta, recarrega e mantém uids e edições", () => {
    dispatch("yarns.set", {
      yarns: [
        { id: "A", name: "a", colorHex: "#5d6b3a" },
        { id: "B", name: "b", colorHex: "#f4f1e8" },
      ],
    });
    dispatch("tool.brush", { text, uid: 20, hops: 0, prop: "yarn", value: "B" });
    dispatch("points.info", { text });
    const saved = JSON.parse(JSON.stringify(exportEdit()));
    loadEdit(saved);
    expect((dispatch("tool.eyedropper", { text, uid: 20, prop: "yarn" }) as { value: string }).value).toBe(
      "B",
    );
    loadEdit({ yarn: "lixo", tension: [[1, "x"]], defaultTension: 9 });
    expect((dispatch("edit.get") as { defaultTension: number }).defaultTension).toBe(0);
  });
});
