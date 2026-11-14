// SPDX-License-Identifier: GPL-3.0-or-later
// Aceite do P3.5 (montagem): peça espelhada, seleção em duas peças, costura entre elas, validação, 3D e persistência.
import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { goProps, goTree, openViewMenu, ribbon, showTab } from "./ribbon.ts";

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const N = 433;

/** Pixel de um ponto das voltas 8 a 11 da peça cujos índices começam em `base`, perto do centro dela. */
async function partPoint(page: Page, base: number) {
  return page.evaluate(
    ([b, n]) => {
      const v = window.__view3d;
      if (!v) throw new Error("sem 3D");
      const xy = v.projectAll();
      let cx = 0;
      let cy = 0;
      for (let i = b as number; i < (b as number) + (n as number); i++) {
        cx += xy[i * 2] as number;
        cy += xy[i * 2 + 1] as number;
      }
      cx /= n as number;
      cy /= n as number;
      let best = (b as number) + 163;
      let bd = Number.POSITIVE_INFINITY;
      for (let i = (b as number) + 163; i <= (b as number) + 306; i++) {
        const d = Math.hypot((xy[i * 2] as number) - cx, (xy[i * 2 + 1] as number) - cy);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return { x: xy[best * 2] as number, y: xy[best * 2 + 1] as number };
    },
    [base, N],
  );
}

test("espelhar, selecionar uma volta em cada peça e costurar; confere contagem e persiste", async ({
  page,
}) => {
  mkdirSync("test-results", { recursive: true });
  await page.goto("/");
  await goTree(page);
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(N);

  // espelhada no plano X: aparecem duas peças e o 3D passa a mostrar as duas
  await ribbon(page, "montagem");
  await page.getByTestId("tool-montagem.mirror-x").click();
  await expect(page.locator("[data-part]")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(2 * N);
  await openViewMenu(page);
  await page.getByRole("menuitem", { name: "Ajustar" }).click();
  // 3D no estilo CrochetPARADE (D-57): o fio das duas peças chega ao 3D num lote só. Os modelos de ponto (tipos, pernas,
  // espelho) voltam a ser conferidos aqui quando `realistic3d` for religado em packages/commands/src/features.ts
  const models = (await page.evaluate(() => window.__view3d?.state().models)) ?? [];
  expect(models).toEqual(["cp:fio"]);

  // lado A: volta de um ponto da peça 1
  const canvas = page.getByTestId("scene").locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("sem canvas");
  await goTree(page);
  await page.getByLabel("Editar Peça 1", { exact: true }).check();
  await tab(page, "Pontos").click();
  await ribbon(page, "selecionar");
  await page.getByTestId("mode-select").click();
  await ribbon(page, "selecionar");
  await page.getByTestId("sel-group").click();
  const a = await partPoint(page, 0);
  await page.mouse.click(box.x + a.x, box.y + a.y);
  await ribbon(page, "selecionar");
  await expect(page.getByTestId("sel-count")).toHaveText("36");
  await goProps(page, "root");
  await page.getByTestId("seam-side-a").click();
  await expect(page.getByTestId("seam-draft-a")).toContainText("Peça 1 · 36 pontos");

  // lado B: clicar num ponto da espelhada ativa essa peça e seleciona a volta dela
  await tab(page, "Pontos").click();
  const b = await partPoint(page, N);
  await page.mouse.click(box.x + b.x, box.y + b.y);
  await ribbon(page, "selecionar");
  await expect(page.getByTestId("sel-count")).toHaveText("36");
  await goTree(page);
  await expect(page.getByLabel("Editar Peça 1 (espelhada)")).toBeChecked();
  await goProps(page, "root");
  await page.getByTestId("seam-side-b").click();
  await expect(page.getByTestId("seam-draft-b")).toContainText("Peça 1 (espelhada) · 36 pontos");
  await expect(page.getByTestId("seam-check")).toContainText("Costura válida: 36 pontos em A, 36 em B");
  await page.screenshot({ path: "test-results/montagem-painel.png" });

  // proporção que não fecha é recusada com sugestão
  await page.getByLabel("Pontos do lado A").selectOption("2");
  await expect(page.getByTestId("seam-check")).toContainText("a contagem não fecha com 2:1");
  await expect(page.getByTestId("seam-create")).toBeDisabled();
  await page.getByLabel("Pontos do lado A").selectOption("1");

  await page.getByTestId("seam-create").click();
  await goTree(page);
  await expect(page.locator("[data-seam]")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().seamSegments)).toBe(36);
  await page.screenshot({ path: "test-results/montagem-3d.png" });
  await goProps(page, "part");

  // não deixa remover a peça com costura
  await page.getByRole("button", { name: "Remover peça" }).click();
  await expect(page.getByTestId("assembly-error")).toContainText("a costura");

  // persiste: peças, costura e 3D voltam ao recarregar
  await page.waitForTimeout(600);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(2 * N);
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().seamSegments)).toBe(36);
  await goTree(page);
  await expect(page.locator("[data-seam]")).toHaveCount(1);
});

test("instância acompanha a edição da original; cópia não", async ({ page }) => {
  await page.goto("/");
  await goTree(page);
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(N);
  await ribbon(page, "montagem");
  await page.getByRole("button", { name: "Instância" }).click();
  await ribbon(page, "montagem");
  await page.getByRole("button", { name: "Cópia" }).click();
  await expect(page.locator("[data-part]")).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(3 * N);

  // edita a receita da original: remove a volta 17; a instância muda junto, a cópia não
  await page.getByLabel("Editar Peça 1", { exact: true }).check();
  const recipe = page.getByLabel("Receita", { exact: true });
  const text = await recipe.inputValue();
  await recipe.fill(text.replace(/\nV17: 6 dim \(6\)/, ""));
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(3 * N - 12);
  // a instância mostra a receita da original e avisa que edita a original
  await page.getByLabel("Editar Peça 1 (instância)").check();
  await expect(page.getByText("edita a original (Peça 1)")).toBeVisible();
  await showTab(page, "Receita");
  await expect(page.getByLabel("Receita", { exact: true })).not.toHaveValue(/V17/);
  await page.getByLabel("Editar Peça 1 (cópia)").check();
  await showTab(page, "Receita");
  await expect(page.getByLabel("Receita", { exact: true })).toHaveValue(/V17: 6 dim \(6\)/);
});

test("copiar uma peça grava as edições dela no disco", async ({ page }) => {
  await page.goto("/");
  await goTree(page);
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(N);
  await ribbon(page, "montagem");
  await page.getByRole("button", { name: "Cópia" }).click();
  await expect(page.locator("[data-part]")).toHaveCount(2);
  await page.waitForTimeout(800);
  const keys = await page.evaluate(() =>
    Object.keys(JSON.parse(localStorage.getItem("novelo3d.edit") ?? "{}")),
  );
  expect(keys).toContain("p2");
});
