// SPDX-License-Identifier: GPL-3.0-or-later
// Modelo do espaço de trabalho (árvore de janelas), presets, layouts do usuário e comandos workspace.*.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import {
  buildLayout,
  compactLayout,
  dispatch,
  findLeaf,
  fits,
  hidePanel,
  type Layout,
  layoutMinSize,
  leafOfPanel,
  leaves,
  loadWorkspace,
  movePanel,
  PANEL_IDS,
  PRESET_SPECS,
  panelMins,
  presetList,
  resetWorkspace,
  resizeSplit,
  type Split,
  setActive,
  setFeature,
  showPanel,
  toggleCollapse,
  validateLayout,
  visiblePanels,
  workspaceSnapshot,
} from "../src/index.ts";

// render e criador de pontos estão pausados (D-57); estes testes de layout ligam os dois para cobrir o conjunto completo
// de painéis (o comportamento com eles desligados está em features.test.ts)
beforeAll(() => {
  setFeature("render", true);
  setFeature("stitchEditor", true);
});
afterAll(() => {
  setFeature("render", false);
  setFeature("stitchEditor", false);
});
afterEach(() => resetWorkspace());

const classic = (): Layout => buildLayout(PRESET_SPECS[0]?.spec as never);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("presets", () => {
  test("todos os presets são válidos e o clássico traz os 5 painéis, cada um uma vez", () => {
    for (const p of PRESET_SPECS) {
      const l = buildLayout(p.spec);
      expect(() => validateLayout(JSON.parse(JSON.stringify(l)))).not.toThrow();
    }
    const all = leaves(classic()).flatMap((l) => l.tabs);
    expect([...all].sort()).toEqual([...PANEL_IDS].sort());
    expect(presetList().map((p) => p.id)).toContain("classic");
  });

  test("o clássico mostra receita, verificação, gráfico e texto CP; o 3D é aba escondida", () => {
    expect([...visiblePanels(classic())].sort()).toEqual(["chart", "cp", "recipe", "verify"]);
  });
});

describe("janelas e abas", () => {
  test("ativar a aba do 3D troca o que está à vista", () => {
    const l = classic();
    const leaf = leafOfPanel(l, "view3d");
    const l2 = setActive(l, leaf?.id as string, 1);
    expect(visiblePanels(l2).has("view3d")).toBe(true);
    expect(visiblePanels(l2).has("chart")).toBe(false);
  });

  test("encolher uma janela a tira da vista; janela única nunca encolhe", () => {
    const l = classic();
    const id = leafOfPanel(l, "recipe")?.id as string;
    const c = toggleCollapse(l, id);
    expect(findLeaf(c, id)?.collapsed).toBe(true);
    expect(visiblePanels(c).has("recipe")).toBe(false);
    expect(findLeaf(toggleCollapse(c, id), id)?.collapsed).toBe(false);
    const solo = buildLayout({ leaf: ["recipe", "verify"] });
    expect(toggleCollapse(solo, (solo.root as { id: string }).id)).toEqual(solo);
  });

  test("redimensionar move a borda, respeita o mínimo e as frações somam 1", () => {
    const l = classic();
    const root = l.root as Split;
    const a = resizeSplit(l, root.id, 0, 0.1);
    const s = (a.root as Split).sizes;
    expect(s[0]).toBeCloseTo((root.sizes[0] as number) + 0.1, 5);
    expect(sum(s)).toBeCloseTo(1, 5);
    const squeezed = resizeSplit(l, root.id, 0, -5);
    expect((squeezed.root as Split).sizes[0]).toBeGreaterThanOrEqual(0.06 - 1e-9);
    expect(sum((squeezed.root as Split).sizes)).toBeCloseTo(1, 5);
    expect(() => resizeSplit(l, "nada", 0, 0.1)).toThrow(/não existe/);
  });
});

describe("mover painéis", () => {
  test("soltar no centro de outra janela vira aba, e a janela vazia some", () => {
    const l = classic();
    const target = leafOfPanel(l, "chart")?.id as string;
    const m = movePanel(l, "verify", target, "center");
    expect(findLeaf(m, target)?.tabs).toEqual(["chart", "view3d", "stitchEditor", "verify"]);
    expect(leafOfPanel(m, "verify")?.id).toBe(target);
    expect(leaves(m)).toHaveLength(leaves(l).length - 1);
    // a coluna que tinha 2 janelas virou uma só: sem divisão com um único filho
    const hasUnary = (n: Layout["root"]): boolean =>
      n.type === "split" && (n.children.length < 2 || n.children.some(hasUnary));
    expect(hasUnary(m.root)).toBe(false);
  });

  test("soltar numa borda divide a janela de destino e cria uma janela nova", () => {
    const l = classic();
    const target = leafOfPanel(l, "recipe")?.id as string;
    const m = movePanel(l, "verify", target, "bottom");
    const t = leafOfPanel(m, "recipe");
    const n = leafOfPanel(m, "verify");
    expect(t?.id).toBe(target);
    expect(n?.tabs).toEqual(["verify"]);
    expect(leaves(m)).toHaveLength(leaves(l).length); // a verificação saiu de uma janela e ganhou outra
    expect(() => validateLayout(JSON.parse(JSON.stringify(m)))).not.toThrow();
  });

  test("mover para a própria janela só ativa a aba; dividir uma janela de uma aba com ela mesma não muda nada", () => {
    const l = classic();
    const own = leafOfPanel(l, "chart")?.id as string;
    expect(visiblePanels(movePanel(l, "view3d", own, "center")).has("view3d")).toBe(true);
    const solo = leafOfPanel(l, "recipe")?.id as string;
    expect(movePanel(l, "recipe", solo, "left")).toEqual(l);
  });

  test("painel e janela inexistentes dão erro claro", () => {
    const l = hidePanel(classic(), "cp");
    expect(() => movePanel(l, "cp", "n1", "center")).toThrow(/não está no layout/);
    expect(() => movePanel(classic(), "cp", "zzz", "center")).toThrow(/não existe/);
  });

  test("ocultar e mostrar painéis; o último não pode ser ocultado", () => {
    const l = hidePanel(classic(), "verify");
    expect(leafOfPanel(l, "verify")).toBeUndefined();
    const back = showPanel(l, "verify");
    expect(leafOfPanel(back, "verify")).toBeDefined();
    let only: Layout = buildLayout({ leaf: ["recipe", "cp"] });
    only = hidePanel(only, "cp");
    expect(() => hidePanel(only, "recipe")).toThrow(/último/);
  });
});

describe("validação", () => {
  test("recusa painel desconhecido, repetido e divisão com tamanhos errados", () => {
    const base = JSON.parse(JSON.stringify(classic()));
    const bad1 = JSON.parse(JSON.stringify(base));
    bad1.root.children[0].tabs = ["xyz"];
    expect(() => validateLayout(bad1)).toThrow(/desconhecido/);
    const bad2 = JSON.parse(JSON.stringify(base));
    bad2.root.children[1].tabs = ["recipe"];
    expect(() => validateLayout(bad2)).toThrow(/duas vezes/);
    const bad3 = JSON.parse(JSON.stringify(base));
    bad3.root.sizes = [1];
    expect(() => validateLayout(bad3)).toThrow(/tamanhos/);
    expect(() => validateLayout(null)).toThrow();
  });
});

describe("comandos workspace.*", () => {
  test("aplicar preset, alterar, salvar como customizado, voltar a ele, renomear e excluir", () => {
    const r1 = dispatch("workspace.applyPreset", { id: "focus3d" }) as {
      presetId: string;
      visible: string[];
    };
    expect(r1.presetId).toBe("focus3d");
    expect(r1.visible).toContain("view3d");

    const r2 = dispatch("workspace.collapse", { panel: "recipe" }) as {
      presetId: string | null;
      visible: string[];
    };
    expect(r2.presetId).toBeNull();
    expect(r2.visible).not.toContain("recipe");

    const r3 = dispatch("workspace.saveCustom", { name: "Meu setup" }) as {
      presetId: string;
      customs: { id: string; name: string }[];
    };
    expect(r3.presetId).toBe("custom:meu-setup");
    expect(r3.customs).toEqual([{ id: "meu-setup", name: "Meu setup" }]);

    dispatch("workspace.applyPreset", { id: "tabs" });
    const back = dispatch("workspace.applyPreset", { id: "custom:meu-setup" }) as { visible: string[] };
    expect(back.visible).not.toContain("recipe"); // o estado salvo (receita encolhida) voltou

    const ren = dispatch("workspace.renameCustom", { id: "meu-setup", name: "Setup do ateliê" }) as {
      customs: { name: string }[];
    };
    expect(ren.customs[0]?.name).toBe("Setup do ateliê");
    const del = dispatch("workspace.deleteCustom", { id: "meu-setup" }) as { customs: unknown[] };
    expect(del.customs).toEqual([]);
    expect(() => dispatch("workspace.applyPreset", { id: "custom:meu-setup" })).toThrow(/não existe/);
  });

  test("mesmo nome sobrescreve; nomes inválidos e presets inexistentes dão erro", () => {
    dispatch("workspace.saveCustom", { name: "A" });
    dispatch("workspace.hidePanel", { panel: "cp" });
    const again = dispatch("workspace.saveCustom", { name: "a" }) as { customs: unknown[]; hidden: string[] };
    expect(again.customs).toHaveLength(1);
    expect(() => dispatch("workspace.saveCustom", { name: "  " })).toThrow(/nome/);
    expect(() => dispatch("workspace.applyPreset", { id: "inexistente" })).toThrow(/não existe/);
  });

  test("mover, ativar aba, redimensionar e ocultar/mostrar pelos comandos", () => {
    dispatch("workspace.reset", {});
    const moved = dispatch("workspace.movePanel", { panel: "cp", toPanel: "chart", zone: "center" }) as {
      visible: string[];
    };
    expect(moved.visible).toContain("cp");
    dispatch("workspace.setActive", { panel: "view3d" });
    expect(visiblePanels(workspaceSnapshot().layout).has("view3d")).toBe(true);
    const root = workspaceSnapshot().layout.root as Split;
    const sized = dispatch("workspace.setSizes", { split: root.id, sizes: [1, 1, 2] }) as {
      layout: { root: Split };
    };
    expect(sized.layout.root.sizes[2]).toBeCloseTo(0.5, 5);
    dispatch("workspace.resize", { split: root.id, index: 0, delta: 0.05 });
    const hid = dispatch("workspace.hidePanel", { panel: "verify" }) as { hidden: string[] };
    expect(hid.hidden).toEqual(["verify"]);
    const shown = dispatch("workspace.showPanel", { panel: "verify" }) as { hidden: string[] };
    expect(shown.hidden).toEqual([]);
    expect(() => dispatch("workspace.movePanel", { panel: "nada", zone: "center" })).toThrow(/inválido/);
    expect(() => dispatch("workspace.movePanel", { panel: "cp", toPanel: "chart", zone: "meio" })).toThrow(
      /zona/,
    );
  });

  test("carregar do navegador: layout inválido volta ao clássico e customs inválidos são descartados", () => {
    const s = loadWorkspace({
      layout: { root: { type: "leaf", id: "x", tabs: ["nada"] } },
      presetId: "tabs",
      customs: [
        { id: "ok", name: "Bom", layout: JSON.parse(JSON.stringify(classic())) },
        { id: "ruim", name: "Ruim", layout: {} },
      ],
    });
    expect(s.presetId).toBe("classic");
    expect(s.customs.map((c) => c.id)).toEqual(["ok"]);
    const t = loadWorkspace(JSON.parse(JSON.stringify(workspaceSnapshot())));
    expect(t.presetId).toBe("classic");
    expect(loadWorkspace(undefined).presetId).toBe("classic");
  });
});

describe("tamanhos mínimos e modo compacto", () => {
  test("o mínimo do layout soma os painéis lado a lado e empilha os de cima para baixo", () => {
    const m = layoutMinSize(classic(), panelMins(320));
    // 3 colunas: receita 220 + verificação 260 + coluna da direita (gráfico/3D: 320) + 2 divisores de 6
    expect(m.w).toBe(220 + 260 + 320 + 12);
    // coluna da direita: janela gráfico/3D (256 + cabeçalho 34) + janela texto CP/fios/render (o maior mínimo é o do Render: 260, + 34) + divisor 6
    expect(m.h).toBe(256 + 34 + 260 + 34 + 6);
  });

  test("o mínimo do 3D é configurável e a altura é 80% da largura", () => {
    expect(panelMins(500).view3d).toEqual({ w: 500, h: 400 });
    expect(layoutMinSize(classic(), panelMins(500)).w).toBe(220 + 260 + 500 + 12);
  });

  test("janela encolhida em barra só pede o tamanho da barra", () => {
    const l = classic();
    const id = leafOfPanel(l, "recipe")?.id as string;
    const c = toggleCollapse(l, id);
    expect(layoutMinSize(c, panelMins(320)).w).toBe(34 + 260 + 320 + 12);
  });

  test("fits: cabe numa tela larga e não cabe numa estreita", () => {
    const mins = panelMins(320);
    expect(fits(classic(), mins, 1280, 700)).toBe(true);
    expect(fits(classic(), mins, 700, 700)).toBe(false);
    expect(fits(classic(), mins, 1280, 300)).toBe(false);
  });

  test("layout compacto: uma janela com todos os painéis em abas, sem mexer no original", () => {
    const l = classic();
    const before = JSON.stringify(l);
    const c = compactLayout(l, "verify");
    expect(leaves(c)).toHaveLength(1);
    expect([...(leaves(c)[0]?.tabs ?? [])].sort()).toEqual([...PANEL_IDS].sort());
    expect(leaves(c)[0]?.tabs[leaves(c)[0]?.active ?? 0]).toBe("verify");
    expect(JSON.stringify(l)).toBe(before);
    // a única janela compacta cabe onde cabe o maior painel
    expect(fits(c, panelMins(320), 340, 330)).toBe(true);
  });
});
