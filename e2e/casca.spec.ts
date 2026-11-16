// SPDX-License-Identifier: GPL-3.0-or-later
// Casca da interface 2 (G1): ribbon por tarefa, busca de comandos, menu Janelas independente dos layouts predefinidos,
// cubo embaixo à esquerda com o menu de vista ao lado, migração única do layout salvo e mais área para o 3D.
import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { openViewMenu, ribbon } from "./ribbon.ts";

const windowTabs = (page: Page) => page.getByRole("tablist", { name: "Abas da janela" });
const cubePos = (page: Page) => page.evaluate(() => window.__view3d?.state().viewCube.position);

test("ribbon: abas na ordem em que o trabalho é feito e botões do mais usado ao menos usado", async ({
  page,
}) => {
  mkdirSync("test-results", { recursive: true });
  await page.goto("/");
  await expect(page.getByRole("tablist", { name: "Abas do ribbon" }).getByRole("tab")).toHaveText([
    "Arquivo",
    "Receita",
    "Selecionar",
    "Pintar",
    "Montagem",
    "Tutorial",
    "Vista",
    "Histórico",
  ]);
  await ribbon(page, "selecionar");
  // ferramenta primeiro (girar, selecionar), depois forma, operação e ações sobre a seleção
  const labels = await page.locator("#ribbon-panel .ribbon-group-label").allTextContents();
  expect(labels).toEqual(["Ferramenta", "Forma da seleção", "Operação", "Seleção", "Filtro"]);
  await page.screenshot({ path: "test-results/casca-ribbon-selecionar.png" });
  // controles longos ficam num painel que abre do botão; o ribbon não cresce
  const h = (await page.locator("#ribbon-panel").boundingBox())?.height;
  await page.getByTestId("pop-filtro").click();
  await expect(page.getByTestId("apply-filter")).toBeVisible();
  expect((await page.locator("#ribbon-panel").boundingBox())?.height).toBe(h);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("apply-filter")).toHaveCount(0);
  await ribbon(page, "pintar");
  await expect(page.getByTestId("brush-brush")).toBeDisabled(); // pincel só vale em Pintar fio ou Tensão
  await page.getByTestId("mode-yarn").click();
  await expect(page.getByTestId("brush-brush")).toBeEnabled();
  await expect(page.getByTestId("options-bar")).toContainText("Pintar fio");
  await page.screenshot({ path: "test-results/casca-ribbon-pintar.png" });
});

test("os botões de modo, forma, pincel e desfazer e os do tutorial saíram das janelas e foram para o ribbon", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Propriedades", exact: true }).click();
  await expect(page.getByTestId("points-panel")).toBeVisible();
  for (const id of ["mode-select", "sel-rect", "brush-brush", "undo", "redo"]) {
    await expect(page.locator(`[data-panel="points"] [data-testid="${id}"]`)).toHaveCount(0);
  }
  // o tutorial deixou de ser janela: virou o modo de leitura, aberto pelo ribbon
  await expect(page.getByRole("tab", { name: "Tutorial", exact: true })).toHaveCount(0);
});

test("busca de comandos: Ctrl+K acha uma ferramenta pelo nome e a executa", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("command-search")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } }); // foco na página, não na barra de endereço
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("command-palette")).toBeVisible();
  await page.getByRole("textbox", { name: "Buscar comando" }).fill("selecion");
  await expect(
    page
      .getByTestId("command-palette")
      .getByRole("button", { name: /Selecionar/ })
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("command-palette")).toHaveCount(0);
  await expect(page.getByTestId("options-bar")).toContainText("Selecionar");
  // sem resultado: mensagem; Esc fecha
  await page.getByTestId("command-search").click();
  await page.getByRole("textbox", { name: "Buscar comando" }).fill("zzzz");
  await expect(page.getByText("Nenhum comando com esse nome.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("apply-filter")).toHaveCount(0);
  await expect(page.getByTestId("command-palette")).toHaveCount(0);
});

test("janelas: desligar uma janela vale mesmo ao trocar de layout predefinido; ligar a traz de volta", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Propriedades", exact: true })).toBeVisible();
  await page.getByTestId("windows-menu").click();
  await expect(page.getByTestId("window-props")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("window-props").click();
  await expect(page.getByTestId("window-props")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("tab", { name: "Propriedades", exact: true })).toHaveCount(0);
  // trocar de layout só reposiciona: a janela continua desligada
  for (const preset of [/Clássico/, /Foco no 3D/, /Tudo em abas/, /Edição/]) {
    await page.getByRole("menuitemradio", { name: preset }).click();
    await page.getByTestId("windows-menu").click();
    await expect(page.getByTestId("window-props")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("tab", { name: "Propriedades", exact: true })).toHaveCount(0);
  }
  await page.getByTestId("window-props").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("apply-filter")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Propriedades", exact: true })).toBeVisible();
});

test("cubo embaixo à esquerda por padrão, com o menu de vista ao lado dele", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => cubePos(page)).toBe("bottom-left");
  const menu = page.getByTestId("view-menu");
  const box = await menu.boundingBox();
  const canvas = await page.getByTestId("scene").locator("canvas").boundingBox();
  if (!box || !canvas) throw new Error("sem 3D");
  expect(box.x).toBeLessThan(canvas.x + 200); // do lado esquerdo
  expect(box.y).toBeGreaterThan(canvas.y + canvas.height / 2); // embaixo
  await openViewMenu(page);
  await expect(page.getByRole("menuitem", { name: "Ajustar" })).toBeVisible();
  for (const v of ["Frente", "Topo", "Direita", "Trás", "Base", "Esquerda", "Isométrica"]) {
    await expect(page.getByRole("menuitem", { name: v, exact: true })).toBeVisible();
  }
  await expect(page.getByTestId("wire-toggle")).toBeVisible();
  await page.screenshot({ path: "test-results/casca-cubo-menu.png" });
  await page.getByRole("menuitem", { name: "Topo", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().viewDir[2])).toBeGreaterThan(0.9);
});

test("migração única: layout antigo e cubo à direita viram o padrão novo; depois as suas escolhas valem", async ({
  page,
}) => {
  const antigo = {
    root: {
      type: "leaf",
      id: "x",
      tabs: ["recipe", "verify", "chart", "view3d"],
      active: 0,
      collapsed: false,
    },
  };
  await page.addInitScript((w) => {
    if (!localStorage.getItem("novelo3d.workspace")) {
      localStorage.setItem("novelo3d.workspace", JSON.stringify({ layout: w, presetId: null, customs: [] }));
      localStorage.setItem(
        "novelo3d.settings",
        JSON.stringify({ interface: { viewCube: { position: "bottom-right", chamfered: true, size: 112 } } }),
      );
    }
  }, antigo);
  await page.goto("/");
  await expect.poll(() => cubePos(page)).toBe("bottom-left");
  await expect(windowTabs(page).first().getByRole("tab")).toHaveText([
    "Receita",
    "Verificação de contagem",
    "Gráfico circular",
    "Texto CrochetPARADE",
  ]);
  // recarregar logo em seguida, sem mexer em nada: o layout e o cubo novos foram gravados (a migração não volta)
  await page.waitForTimeout(500);
  await page.reload();
  await expect.poll(() => cubePos(page)).toBe("bottom-left");
  await expect(windowTabs(page).first().getByRole("tab")).toHaveText([
    "Receita",
    "Verificação de contagem",
    "Gráfico circular",
    "Texto CrochetPARADE",
  ]);
  // o que o usuário muda depois (janela desligada) sobrevive ao recarregar
  await page.getByTestId("windows-menu").click();
  await page.getByTestId("window-cp").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("apply-filter")).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByTestId("windows-menu").click();
  await expect(page.getByTestId("window-cp")).toHaveAttribute("aria-checked", "false");
});

test("mais área para o 3D: ocupa a maior parte da tela e o ribbon recolhido devolve altura", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const size = async () => {
    const b = await page.getByTestId("scene").locator("canvas").boundingBox();
    if (!b) throw new Error("sem canvas");
    return b;
  };
  const a = await size();
  expect(a.width).toBeGreaterThan(1280 * 0.6);
  expect(a.height).toBeGreaterThan(720 * 0.6);
  await page.getByTestId("ribbon-collapse").click();
  await expect(page.locator("#ribbon-panel")).toHaveCount(0);
  await expect.poll(async () => (await size()).height).toBeGreaterThan(a.height + 40);
  await page.screenshot({ path: "test-results/casca-3d-grande.png" });
  await page.getByTestId("ribbon-tab-receita").click(); // clicar numa aba reabre o ribbon
  await expect(page.locator("#ribbon-panel")).toBeVisible();
});
