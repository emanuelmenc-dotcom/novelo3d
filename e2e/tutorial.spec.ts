// SPDX-License-Identifier: GPL-3.0-or-later
// Tutorial passo a passo (P4, docs/13 seção 8): a janela mostra o passo, o 3D destaca o ponto e as bases, e o usuário
// volta ao mesmo lugar depois de recarregar.
import { expect, type Page, test } from "@playwright/test";

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const state = (page: Page) => page.evaluate(() => window.__view3d?.state());

async function open(page: Page) {
  await page.goto("/");
  await tab(page, "3D").click();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await tab(page, "Tutorial").click();
  await expect(page.getByTestId("tutorial-text")).toBeVisible();
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
  await page.getByTestId("tutorial-show").click();
  await page.screenshot({ path: "test-results/tutorial-mostrar-ponto.png" });
});

test("ir à volta, voltar e as setas do teclado andam os passos", async ({ page }) => {
  await open(page);
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
  await page.getByTestId("tutorial-round").selectOption("9");
  await page.getByTestId("tutorial-next").click();
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
  await page.getByLabel("Receita", { exact: true }).fill("V1: 6 pb no anel mágico (6)\nV2: 6 aum (13)");
  await expect(page.getByTestId("tutorial-count-warning")).toBeVisible();
  await page.getByLabel("Receita", { exact: true }).fill("V1: 6 pb no anel mágico (6)\nV2-40: aum @each");
  await expect(page.getByTestId("tutorial-error")).toContainText("passa de");
  await expect(page.getByLabel("Receita", { exact: true })).toBeVisible();
});

test("numa montagem com peça espelhada o destaque cai nos pontos da peça ativa", async ({ page }) => {
  await open(page);
  await tab(page, "Montagem").click();
  await page.getByRole("button", { name: "Espelhada" }).click();
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

test("quem tem um layout salvo sem a janela Tutorial a encontra em Layout > Mostrar Tutorial", async ({
  page,
}) => {
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
      if (!localStorage.getItem("novelo3d.workspace"))
        localStorage.setItem("novelo3d.workspace", JSON.stringify(w));
    },
    { layout: antigo, presetId: null, customs: [] },
  );
  await page.goto("/");
  await expect(tab(page, "Tutorial")).toHaveCount(0);
  await page.getByRole("button", { name: "Layout" }).click();
  await page.getByRole("menuitem", { name: /Mostrar Tutorial/ }).click();
  await tab(page, "3D").click();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await tab(page, "Tutorial").click();
  await expect(page.getByTestId("tutorial-text")).toContainText("Volta 1, ponto 1 de 6");
  // a janela entra ao lado da receita e o 3D continua à vista: o destaque aparece
  await expect.poll(async () => (await state(page))?.tutorial.current.length).toBeGreaterThan(0);
});

test('"Mostrar ponto" funciona nos polos da peça (voltas 1 e 17)', async ({ page }) => {
  await open(page);
  await page.getByTestId("tutorial-show").click();
  await page.screenshot({ path: "test-results/tutorial-polo-volta1.png" });
  await page.getByTestId("tutorial-round").selectOption("17");
  await page.getByTestId("tutorial-show").click();
  await page.screenshot({ path: "test-results/tutorial-polo-volta17.png" });
  const pos = await page.evaluate(() => window.__view3d?.cameraState().position ?? [0, 0, 0]);
  expect(pos.every((v) => Number.isFinite(v))).toBe(true);
});
