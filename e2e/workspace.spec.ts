// SPDX-License-Identifier: GPL-3.0-or-later
// Interface modular: janelas com tamanho editável, encolher em barra, abas arrastáveis, presets, layouts do usuário
// (persistidos) e os mesmos comandos workspace.* pelo MCP (D-21).
import { mkdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, type Page, test } from "@playwright/test";
import { classicLayout, ribbon, showTab } from "./ribbon.ts";

const PORT = 47895;

const windowTabs = (page: Page) => page.getByRole("tablist", { name: "Abas da janela" });

const leafOf = (page: Page, panel: string) =>
  page.locator("section.ws-leaf", { has: page.locator(`[data-panel="${panel}"]`) });
const widthOf = async (page: Page, panel: string) => (await leafOf(page, panel).boundingBox())?.width ?? 0;

async function mcp() {
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["tools/mcp-server/src/server.mjs"],
      env: { ...process.env, NOVELO_BRIDGE_PORT: String(PORT) } as Record<string, string>,
    }),
  );
  const call = async (method: string, params: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name: "novelo_bridge_call", arguments: { method, params } });
    const text = (r.content as { text: string }[])[0]?.text ?? "";
    return { isError: r.isError === true, text, json: r.isError ? null : JSON.parse(text) };
  };
  return { client, call };
}

test("layout padrão: coluna da esquerda em abas e o 3D ocupando o resto da tela", async ({ page }) => {
  mkdirSync("test-results", { recursive: true });
  await page.goto("/");
  await expect(page.getByTestId("workspace")).toBeVisible();
  await showTab(page, "Receita");
  await expect(page.getByLabel("Receita", { exact: true })).toBeVisible();
  await showTab(page, "Verificação de contagem");
  await expect(page.getByTestId("verify-table")).toBeVisible();
  await showTab(page, "Gráfico circular");
  await expect(page.getByTestId("chart").locator("svg")).toBeVisible();
  await showTab(page, "Texto CrochetPARADE");
  await expect(page.getByLabel("Texto CrochetPARADE", { exact: true })).toBeVisible();
  // coluna da esquerda: receita, verificação, gráfico e texto CP em abas; embaixo as ferramentas de pontos em abas
  await expect(windowTabs(page).first().getByRole("tab")).toHaveText([
    "Receita",
    "Verificação de contagem",
    "Gráfico circular",
    "Texto CrochetPARADE",
  ]);
  await expect(windowTabs(page).nth(1).getByRole("tab")).toHaveText([
    "Pontos",
    "Fios",
    "Montagem",
    "Materiais",
    "Tutorial",
  ]);
  // o 3D está sempre à vista e é a janela mais larga
  await expect(page.getByTestId("scene").locator("canvas")).toBeVisible();
  expect(await widthOf(page, "view3d")).toBeGreaterThan((await widthOf(page, "cp")) * 2);
  await page.screenshot({ path: "test-results/ws-padrao.png" });
});

test("divisores: arrastar com o mouse e com o teclado muda o tamanho das janelas", async ({ page }) => {
  await page.goto("/");
  const before = await widthOf(page, "recipe");
  const bar = page.getByTestId("splitter-n1-0");
  const box = await bar.boundingBox();
  if (!box) throw new Error("sem divisor");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const dragged = await widthOf(page, "recipe");
  expect(dragged).toBeGreaterThan(before + 100);

  await bar.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
  expect(await widthOf(page, "recipe")).toBeLessThan(dragged - 20);

  // não deixa a janela sumir: o mínimo é respeitado
  const box2 = await bar.boundingBox();
  if (!box2) throw new Error("sem divisor");
  await page.mouse.move(box2.x + 3, box2.y + 20);
  await page.mouse.down();
  await page.mouse.move(box2.x - 2000, box2.y + 20, { steps: 6 });
  await page.mouse.up();
  expect(await widthOf(page, "recipe")).toBeGreaterThan(60);
});

test("encolher uma janela numa barra e restaurar", async ({ page }) => {
  await page.goto("/");
  await classicLayout(page);
  const full = await widthOf(page, "recipe");
  await page.getByRole("button", { name: "Encolher Receita" }).click();
  await expect(page.getByLabel("Receita", { exact: true })).toHaveCount(0);
  const bar = page.locator('section.ws-bar[data-collapsed="true"]');
  await expect(bar).toHaveCount(1);
  expect((await bar.boundingBox())?.width ?? 999).toBeLessThan(50); // barra vertical fina
  // o espaço liberado vai para as outras janelas
  expect(await widthOf(page, "verify")).toBeGreaterThan(full);
  await page.screenshot({ path: "test-results/ws-barra.png" });
  await page.getByRole("button", { name: /Restaurar Receita/ }).click();
  await showTab(page, "Receita");
  await expect(page.getByLabel("Receita", { exact: true })).toBeVisible();
  expect(Math.abs((await widthOf(page, "recipe")) - full)).toBeLessThan(6);
});

test("arrastar abas: para outra janela (vira aba) e para a borda (divide)", async ({ page }) => {
  await page.goto("/");
  await classicLayout(page);
  // o texto CP vira aba da janela do gráfico
  await page.getByRole("tab", { name: "Texto CrochetPARADE" }).dragTo(page.locator('[data-panel="chart"]'));
  const tabs = page.getByRole("tablist").filter({ has: page.getByRole("tab", { name: "Gráfico circular" }) });
  await expect(tabs.getByRole("tab")).toHaveText(["Gráfico circular", "3D", "Texto CrochetPARADE"]);
  // a aba recebida fica ativa: o texto CP aparece no lugar do gráfico
  await showTab(page, "Texto CrochetPARADE");
  await expect(page.getByLabel("Texto CrochetPARADE", { exact: true })).toBeVisible();
  await expect(page.getByTestId("chart")).toHaveCount(0);

  // o 3D solta na borda esquerda da receita: ganha janela própria à esquerda
  await page.getByRole("tab", { name: "3D", exact: true }).click();
  await page.getByRole("tab", { name: "3D", exact: true }).dragTo(page.locator('[data-panel="recipe"]'), {
    targetPosition: { x: 8, y: 150 },
  });
  await expect(page.getByTestId("scene").locator("canvas")).toBeVisible();
  const view = await leafOf(page, "view3d").boundingBox();
  const recipe = await leafOf(page, "recipe").boundingBox();
  if (!view || !recipe) throw new Error("sem janelas");
  expect(view.x).toBeLessThan(recipe.x); // 3D à esquerda da receita
  await page.screenshot({ path: "test-results/ws-arrastado.png" });
});

test("presets: Foco no 3D, Tudo em abas e volta ao clássico", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("windows-menu").click();
  await page.getByRole("menuitemradio", { name: /Foco no 3D/ }).click();
  await expect(page.getByTestId("scene").locator("canvas")).toBeVisible();
  const f3d = await leafOf(page, "view3d").boundingBox();
  const rec = await leafOf(page, "recipe").boundingBox();
  if (!f3d || !rec) throw new Error("sem janelas");
  expect(f3d.width).toBeGreaterThan(rec.width * 2); // o 3D domina a tela
  await page.screenshot({ path: "test-results/ws-foco3d.png" });

  await page.getByTestId("windows-menu").click();
  await page.getByRole("menuitemradio", { name: /Tudo em abas/ }).click();
  await expect(page.locator("section.ws-leaf")).toHaveCount(1);
  await expect(windowTabs(page).getByRole("tab")).toHaveCount(10);
  await page.getByRole("tab", { name: "Receita", exact: true }).click();
  await showTab(page, "Receita");
  await expect(page.getByLabel("Receita", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/ws-abas.png" });

  await page.getByTestId("windows-menu").click();
  await page.getByRole("menuitemradio", { name: /Clássico/ }).click();
  await expect(page.locator("section.ws-leaf")).toHaveCount(4);
});

test("layouts do usuário: salvar, aplicar, persistir ao recarregar, renomear e excluir", async ({ page }) => {
  await page.goto("/");
  await classicLayout(page);
  // arruma do jeito do usuário: receita encolhida e texto CP oculto
  await page.getByRole("button", { name: "Encolher Receita" }).click();
  await page.getByRole("button", { name: "Ocultar Texto CrochetPARADE" }).click();
  await page.getByTestId("windows-menu").click();
  await page.getByLabel("Nome do layout").fill("Meu ateliê");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: /Meu ateliê/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Escape");

  // troca para outro layout e volta ao do usuário
  await page.getByTestId("windows-menu").click();
  await page.getByRole("menuitemradio", { name: /Tudo em abas/ }).click();
  await page.getByTestId("windows-menu").click();
  await page.getByRole("menuitemradio", { name: /Meu ateliê/ }).click();
  await expect(page.locator('section.ws-bar[data-collapsed="true"]')).toHaveCount(1);
  await expect(page.getByLabel("Texto CrochetPARADE", { exact: true })).toHaveCount(0);

  // persiste ao recarregar a página
  await page.reload();
  await expect(page.locator('section.ws-bar[data-collapsed="true"]')).toHaveCount(1);
  await page.getByTestId("windows-menu").click();
  await expect(page.getByRole("menuitemradio", { name: /Meu ateliê/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // a janela desligada aparece desmarcada no menu Janelas
  await expect(page.getByTestId("window-cp")).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");

  // gerenciar em Configurações > Layout
  await ribbon(page, "arquivo");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("tab", { name: "Layout" }).click();
  const item = page.locator('[data-custom="meu-atelie"]');
  await expect(item).toContainText("Meu ateliê");
  await item.getByRole("button", { name: "Renomear" }).click();
  await page.getByLabel("Novo nome").fill("Ateliê 2");
  await page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(item).toContainText("Ateliê 2");
  await page.screenshot({ path: "test-results/ws-config-layout.png" });
  await item.getByRole("button", { name: "Excluir" }).click();
  await expect(page.locator("[data-custom]")).toHaveCount(0);
});

test("o MCP organiza as janelas pelos mesmos comandos workspace.*", async ({ page }) => {
  const { client, call } = await mcp();
  try {
    await page.goto(`/?bridge=${PORT}`);
    await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });

    const got = await call("workspace.get");
    expect(got.isError, got.text).toBe(false);
    expect(got.json.presetId).toBe("edit");
    expect(got.json.presets.map((p: { id: string }) => p.id)).toEqual(
      expect.arrayContaining(["edit", "classic", "focus3d", "chart", "stack", "tabs"]),
    );

    // janela ligada e desligada pelo mesmo comando do menu Janelas
    const off = await call("workspace.setPanelVisible", { panel: "cp", visible: false });
    expect(off.json.windows.find((w: { panel: string }) => w.panel === "cp").visible).toBe(false);
    expect((await call("workspace.setPanelVisible", { panel: "cp" })).isError).toBe(true);
    const on = await call("workspace.setPanelVisible", { panel: "cp", visible: true });
    expect(on.json.windows.find((w: { panel: string }) => w.panel === "cp").visible).toBe(true);

    await call("workspace.applyPreset", { id: "tabs" });
    await expect(page.locator("section.ws-leaf")).toHaveCount(1);
    await call("workspace.applyPreset", { id: "classic" });
    await call("workspace.collapse", { panel: "verify", collapsed: true });
    await expect(page.locator('section.ws-bar[data-collapsed="true"]')).toHaveCount(1);
    const moved = await call("workspace.movePanel", { panel: "cp", toPanel: "chart", zone: "center" });
    expect(moved.json.layout).toBeDefined();
    await expect(page.getByRole("tab", { name: "Texto CrochetPARADE" })).toBeVisible();

    const saved = await call("workspace.saveCustom", { name: "Via MCP" });
    expect(saved.json.customs).toEqual([{ id: "via-mcp", name: "Via MCP" }]);
    await page.getByTestId("windows-menu").click();
    await expect(page.getByRole("menuitemradio", { name: /Via MCP/ })).toBeVisible();
    await page.keyboard.press("Escape");

    expect((await call("workspace.applyPreset", { id: "nao-existe" })).isError).toBe(true);
    expect((await call("workspace.movePanel", { panel: "cp", toPanel: "chart", zone: "meio" })).isError).toBe(
      true,
    );
    await call("workspace.deleteCustom", { id: "via-mcp" });
    await call("workspace.reset");
    await expect(page.locator("section.ws-leaf")).toHaveCount(3);
  } finally {
    await client.close();
  }
});

test("D-57: um layout salvo (e um do usuário) com Render e Criador de pontos abre sem esses painéis e sem erro", async ({
  page,
}) => {
  const old = (id: string) => ({
    root: {
      type: "leaf",
      id,
      tabs: ["recipe", "render", "stitchEditor", "chart", "view3d"],
      active: 2,
      collapsed: false,
    },
  });
  await page.addInitScript(
    (w) => {
      if (!localStorage.getItem("novelo3d.workspace")) {
        localStorage.setItem("novelo3d.workspace", JSON.stringify(w));
        localStorage.setItem("novelo3d.ui", JSON.stringify({ version: 2 }));
      }
    },
    { layout: old("a"), presetId: null, customs: [{ id: "antigo", name: "Antigo", layout: old("b") }] },
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "3D", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Render", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Criador de pontos", exact: true })).toHaveCount(0);
  // o layout do usuário também aplica sem trazer os painéis pausados de volta
  await page.getByTestId("windows-menu").click();
  await page.getByRole("menuitemradio", { name: /Antigo/ }).click();
  await expect(page.getByRole("tab", { name: "3D", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Render", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Criador de pontos", exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
