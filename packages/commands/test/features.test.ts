// SPDX-License-Identifier: GPL-3.0-or-later
// Recursos pausados (D-57): com `render` e `stitchEditor` desligados (o padrão) os painéis e os comandos não existem para
// quem usa o app; ligados, tudo volta.
import { afterEach, describe, expect, test } from "vitest";
import {
  buildLayout,
  dispatch,
  enabledPanels,
  features,
  hiddenPanels,
  leaves,
  normalize,
  PANEL_IDS,
  PRESET_SPECS,
  resetWorkspace,
  setFeature,
  validateLayout,
} from "../src/index.ts";

afterEach(() => {
  setFeature("render", false);
  setFeature("stitchEditor", false);
  resetWorkspace();
});

const refused = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return "ok";
};

describe("com o render e o criador de pontos desligados (padrão)", () => {
  test("os interruptores começam desligados, inclusive o 3D realista", () => {
    expect(features()).toEqual({ render: false, stitchEditor: false, realistic3d: false });
  });

  test("os painéis Render e Criador de pontos não existem em nenhum preset, e cada painel que existe aparece uma vez", () => {
    expect(enabledPanels()).toEqual(PANEL_IDS.filter((p) => p !== "render" && p !== "stitchEditor"));
    for (const p of PRESET_SPECS) {
      const tabs = leaves(buildLayout(p.spec)).flatMap((l) => l.tabs);
      expect(tabs, p.id).not.toContain("render");
      expect(tabs, p.id).not.toContain("stitchEditor");
      expect([...tabs].sort(), p.id).toEqual([...enabledPanels()].sort());
    }
  });

  test("não entram na lista de painéis ocultos", () => {
    expect(hiddenPanels(buildLayout(PRESET_SPECS[0]?.spec as never))).toEqual([]);
  });

  test("um layout salvo com esses painéis continua abrindo: eles são tirados e o resto fica", () => {
    setFeature("render", true);
    setFeature("stitchEditor", true);
    const saved = JSON.parse(JSON.stringify(buildLayout(PRESET_SPECS[0]?.spec as never)));
    expect(leaves(saved).flatMap((l) => l.tabs)).toContain("render");
    setFeature("render", false);
    setFeature("stitchEditor", false);
    const opened = normalize(validateLayout(saved));
    const tabs = leaves(opened).flatMap((l) => l.tabs);
    expect(tabs).not.toContain("render");
    expect(tabs).not.toContain("stitchEditor");
    expect(tabs).toContain("chart");
    // a aba ativa continua apontando para um painel que existe
    for (const leaf of leaves(opened)) expect(leaf.tabs[leaf.active]).toBeDefined();
  });

  test("os comandos render.* e stitchEditor.* recusam como recurso pausado, e as janelas não podem ser trazidas", () => {
    expect(refused(() => dispatch("render.status"))).toContain("recurso pausado");
    expect(refused(() => dispatch("render.start"))).toContain("recurso pausado");
    expect(refused(() => dispatch("stitchEditor.state"))).toContain("recurso pausado");
    expect(refused(() => dispatch("stitchEditor.apply", { kind: "yo" }))).toContain("recurso pausado");
    expect(refused(() => dispatch("workspace.showPanel", { panel: "render" }))).toContain("pausado");
    expect(refused(() => dispatch("workspace.showPanel", { panel: "stitchEditor" }))).toContain("pausado");
    // o resto continua valendo
    expect(refused(() => dispatch("workspace.get"))).toBe("ok");
    expect(refused(() => dispatch("system.ping"))).toBe("ok");
  });
});

describe("religando os recursos", () => {
  test("ligar o render traz o painel e os comandos de volta; desligar tira de novo", () => {
    setFeature("render", true);
    expect(enabledPanels()).toContain("render");
    expect(refused(() => dispatch("render.status"))).toBe("ok");
    const tabs = leaves(buildLayout(PRESET_SPECS[0]?.spec as never)).flatMap((l) => l.tabs);
    expect(tabs).toContain("render");
    expect(tabs).not.toContain("stitchEditor");
    setFeature("render", false);
    expect(refused(() => dispatch("render.status"))).toContain("recurso pausado");
  });

  test("ligar o criador de pontos traz o painel e os comandos de volta", () => {
    setFeature("stitchEditor", true);
    expect(enabledPanels()).toContain("stitchEditor");
    expect(refused(() => dispatch("stitchEditor.state"))).toBe("ok");
    dispatch("stitchEditor.reset");
  });
});
