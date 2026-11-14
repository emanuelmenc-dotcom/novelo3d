// SPDX-License-Identifier: GPL-3.0-or-later
// Tutorial passo a passo (P4, docs/13 seção 8): a janela mostra o passo, o 3D destaca o ponto e as bases, e o usuário
// volta ao mesmo lugar depois de recarregar.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, type Page, test } from "@playwright/test";
import { ribbon, showTab } from "./ribbon.ts";

const PORT = 47905;

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const state = (page: Page) => page.evaluate(() => window.__view3d?.state());

async function open(page: Page) {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await tab(page, "Tutorial").click();
  await expect(page.getByTestId("tutorial-text")).toBeVisible();
  await ribbon(page, "tutorial");
}

test("avançar até o fim da volta 2: 12 passos, 18 pontos feitos e o aviso de fim de volta", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByTestId("tutorial-text")).toContainText("Volta 1, ponto 1 de 6");
  await expect(page.getByTestId("tutorial-progress")).toContainText("Passo 1 de 402");
  // 11 cliques em Próximo levam ao passo 12, o último da volta 2
  for (let i = 0; i < 11; i++) await page.getByTestId("tutorial-next").click();
  await expect(page.getByTestId("tutorial-progress")).toContainText("Passo 12 de 402");
  await expect(page.getByTestId("tutorial-text")).toContainText("Volta 2, ponto 6 de 6");
  await expect(page.getByTestId("tutorial-alerts")).toContainText("Fim da volta 2");
  // 3D: o aumento atual tem 2 pontos; os 16 pontos anteriores (e o anel) estão feitos; o resto está esmaecido
  await expect.poll(async () => (await state(page))?.tutorial.current.length).toBe(2);
  const t = (await state(page))?.tutorial;
  expect(t?.parents.length).toBe(1);
  expect(t?.faded).toBe(433 - 1 - 16 - 2);
  await page.screenshot({ path: "test-results/tutorial-passo12.png" });
  // "Mostrar ponto" leva a câmera ao ponto atual: de longe e de perto os pontos ficam alcançáveis
  await ribbon(page, "tutorial");
  await page.getByTestId("tutorial-show").click();
  await page.screenshot({ path: "test-results/tutorial-mostrar-ponto.png" });
});

test("ir à volta, voltar e as setas do teclado andam os passos", async ({ page }) => {
  await open(page);
  await ribbon(page, "tutorial");
  await page.getByTestId("tutorial-round").selectOption("5");
  await expect(page.getByTestId("tutorial-text")).toContainText("Volta 5, ponto 1 de");
  await expect(page.getByTestId("tutorial-alerts")).toContainText("Começa a volta 5");
  await page.getByTestId("tutorial-text").click(); // tira o foco do seletor: com um campo em foco as setas não andam o tutorial
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("tutorial-text")).toContainText("Volta 5, ponto 2 de");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("tutorial-text")).toContainText("Volta 4, ponto");
  await expect(page.getByTestId("tutorial-alerts")).toContainText("Fim da volta 4");
});

test("recarregar a página volta ao mesmo passo", async ({ page }) => {
  await open(page);
  await ribbon(page, "tutorial");
  await page.getByTestId("tutorial-round").selectOption("9");
  await ribbon(page, "tutorial");
  await page.getByTestId("tutorial-next").click();
  await ribbon(page, "tutorial");
  await page.getByTestId("tutorial-show").click();
  await page.screenshot({ path: "test-results/tutorial-volta9.png" });
  await expect(page.getByTestId("tutorial-text")).toContainText("Volta 9, ponto 2");
  await page.waitForTimeout(500);
  await page.reload();
  await tab(page, "Tutorial").click();
  await expect(page.getByTestId("tutorial-text")).toContainText("Volta 9, ponto 2");
});

test("receita que não fecha avisa; receita acima do limite mostra a mensagem e o app continua", async ({
  page,
}) => {
  await open(page);
  await showTab(page, "Receita");
  await page.getByLabel("Receita", { exact: true }).fill("V1: 6 pb no anel mágico (6)\nV2: 6 aum (13)");
  await expect(page.getByTestId("tutorial-count-warning")).toBeVisible();
  await showTab(page, "Receita");
  await page.getByLabel("Receita", { exact: true }).fill("V1: 6 pb no anel mágico (6)\nV2-40: aum @each");
  await expect(page.getByTestId("tutorial-error")).toContainText("passa de");
  await showTab(page, "Receita");
  await expect(page.getByLabel("Receita", { exact: true })).toBeVisible();
});

test("numa montagem com peça espelhada o destaque cai nos pontos da peça ativa", async ({ page }) => {
  await open(page);
  await tab(page, "Montagem").click();
  await ribbon(page, "montagem");
  await page.getByTestId("tool-montagem.mirror-x").click();
  await expect(page.locator("[data-part]")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(866);
  await page.locator("[data-part]").nth(1).click();
  await tab(page, "Tutorial").click();
  await expect(page.getByTestId("tutorial-text")).toContainText("Volta 1, ponto 1 de 6");
  // a peça espelhada vem depois da original: seus pontos têm índices acima dos 433 da primeira
  await expect.poll(async () => ((await state(page))?.tutorial.current[0] ?? 0) > 433).toBe(true);
});

test("setas andam o passo logo depois de clicar em Próximo, sem precisar tirar o foco do botão", async ({
  page,
}) => {
  await open(page);
  await ribbon(page, "tutorial");
  await page.getByTestId("tutorial-next").click();
  await expect(page.getByTestId("tutorial-text")).toContainText("ponto 2 de");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("tutorial-text")).toContainText("ponto 3 de");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("tutorial-text")).toContainText("ponto 2 de");
});

test("com um divisor em foco as setas movem o divisor, não o tutorial", async ({ page }) => {
  await open(page);
  await page.getByRole("separator").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("tutorial-text")).toContainText("Volta 1, ponto 1 de");
});

test("quem tem um layout salvo sem a janela Tutorial a encontra em Janelas > Tutorial", async ({ page }) => {
  const leaf = (id: string, tabs: string[]) => ({ type: "leaf", id, tabs, active: 0, collapsed: false });
  const antigo = {
    root: {
      type: "split",
      id: "s1",
      dir: "row",
      sizes: [0.3, 0.7],
      children: [
        leaf("l1", ["recipe", "verify"]),
        {
          type: "split",
          id: "s2",
          dir: "column",
          sizes: [0.7, 0.3],
          children: [
            leaf("l2", ["chart", "view3d"]),
            leaf("l3", ["cp", "yarns", "points", "assembly", "materials"]),
          ],
        },
      ],
    },
  };
  await page.addInitScript(
    (w) => {
      if (!localStorage.getItem("novelo3d.workspace")) {
        localStorage.setItem("novelo3d.workspace", JSON.stringify(w));
        localStorage.setItem("novelo3d.ui", JSON.stringify({ version: 2 }));
      }
    },
    { layout: antigo, presetId: null, customs: [] },
  );
  await page.goto("/");
  await expect(tab(page, "Tutorial")).toHaveCount(0);
  await page.getByTestId("windows-menu").click();
  await page.getByTestId("window-tutorial").click();
  await page.keyboard.press("Escape");
  await tab(page, "3D").click(); // neste layout antigo o 3D é aba junto do gráfico
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await tab(page, "Tutorial").click();
  await expect(page.getByTestId("tutorial-text")).toContainText("Volta 1, ponto 1 de 6");
  // a janela entra ao lado da receita e o 3D continua à vista: o destaque aparece
  await expect.poll(async () => (await state(page))?.tutorial.current.length).toBeGreaterThan(0);
});

test('"Mostrar ponto" funciona nos polos da peça (voltas 1 e 17)', async ({ page }) => {
  await open(page);
  await ribbon(page, "tutorial");
  await page.getByTestId("tutorial-show").click();
  await page.screenshot({ path: "test-results/tutorial-polo-volta1.png" });
  await ribbon(page, "tutorial");
  await page.getByTestId("tutorial-round").selectOption("17");
  await ribbon(page, "tutorial");
  await page.getByTestId("tutorial-show").click();
  await page.screenshot({ path: "test-results/tutorial-polo-volta17.png" });
  const pos = await page.evaluate(() => window.__view3d?.cameraState().position ?? [0, 0, 0]);
  expect(pos.every((v) => Number.isFinite(v))).toBe(true);
});

test("setas andam o passo logo depois de abrir a aba Tutorial (o foco fica na aba)", async ({ page }) => {
  await open(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("tutorial-text")).toContainText("ponto 2 de");
});

test("o MCP anda o tutorial pelos mesmos comandos tutorial.* e o projeto leva a posição", async ({
  page,
}) => {
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
  try {
    await page.goto(`/?bridge=${PORT}`);
    await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });
    await tab(page, "Tutorial").click();
    await showTab(page, "Receita");
    const text = await page.getByLabel("Receita", { exact: true }).inputValue();
    const r = await call("tutorial.goto", { text, round: 2 });
    expect(r.isError, r.text).toBe(false);
    expect(r.json.step.round).toBe(2);
    await expect(page.getByTestId("tutorial-text")).toContainText("Volta 2, ponto 1");
    const bad = await call("tutorial.goto", { text, round: 99 });
    expect(bad.isError).toBe(true);
    const sl = await call("tutorial.script", { text, from: 0, count: 3 });
    expect(sl.json.steps.length).toBe(3);
    const proj = await call("project.export");
    expect(proj.isError, proj.text).toBe(false);
    expect(proj.json.app).toBe("novelo3d");
    expect(proj.json.tutorial.p1.index).toBe(6);
  } finally {
    await client.close();
  }
});
