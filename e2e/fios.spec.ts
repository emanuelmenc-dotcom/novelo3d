// SPDX-License-Identifier: GPL-3.0-or-later
// Aceite do P3.5 (fios): cor por comprimento (listras, degradê), material e espessura por padrão, efeito no 3D e consumo.
import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

test("fio com listras por comprimento, material e espessura: prévia, 3D e consumo", async ({ page }) => {
  mkdirSync("test-results", { recursive: true });
  await page.goto("/");
  await tab(page, "Fios").click();
  await page.getByRole("button", { name: "Editar fio A" }).click();
  const editor = page.getByTestId("yarn-editor-A");
  await expect(editor).toBeVisible();

  // listras de 2 m com duas cores: a prévia de 30 m mostra as duas
  await page.getByLabel("Tipo de cor do fio A").selectOption("stripes");
  await page.getByLabel("Trecho de cor do fio A em metros").fill("2");
  await page.getByLabel("Cor 2 do fio A", { exact: true }).fill("#1565c0");
  const preview = page.getByTestId("yarn-preview-A").locator("span");
  const distinct = async () =>
    new Set(await preview.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.backgroundColor)))
      .size;
  await expect.poll(distinct).toBe(2);

  // degradê com 3 cores: muitas cores intermediárias
  await page.getByLabel("Adicionar cor ao fio A").click();
  await page.getByLabel("Tipo de cor do fio A").selectOption("gradient");
  await page.getByLabel("Trecho de cor do fio A em metros").fill("5");
  await expect.poll(distinct).toBeGreaterThan(6);

  // material e espessura: padrão dos EUA e do Brasil, com a ficha aproximada
  await page.getByLabel("Material do fio A").selectOption("mohair");
  await page.getByLabel("Região da espessura do fio A").selectOption("eua");
  await page.getByLabel("Espessura do fio A", { exact: true }).selectOption("cyc-5");
  await expect(page.getByTestId("thickness-info-A")).toContainText("120 m/100 g");
  await page.getByLabel("Região da espessura do fio A").selectOption("br");
  await page.getByLabel("Espessura do fio A", { exact: true }).selectOption("br-barbante-4-6");
  await expect(page.getByTestId("thickness-info-A")).toContainText("150 m/100 g");
  await expect(page.getByLabel("Diâmetro do fio A em mm")).toHaveValue("2.4");
  await page.screenshot({ path: "test-results/fios-editor.png" });

  // consumo mostra gramas aproximadas
  await expect(page.locator('[data-usage="A"]')).toContainText(/\d+/);

  // 3D: os pontos têm várias cores ao longo do fio (degradê), na ordem do trabalho
  await tab(page, "3D").click();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(433);
  const colors = await page.evaluate(() =>
    Array.from({ length: 433 }, (_, i) => window.__view3d?.nodeColor(i)),
  );
  expect(new Set(colors).size).toBeGreaterThan(20);
  expect(colors[1]).not.toBe(colors[430]);
  await page.screenshot({ path: "test-results/fios-3d.png" });

  // persiste ao recarregar
  await page.reload();
  await tab(page, "Fios").click();
  await page.getByRole("button", { name: "Editar fio A" }).click();
  await expect(page.getByLabel("Tipo de cor do fio A")).toHaveValue("gradient");
  await expect(page.getByLabel("Material do fio A")).toHaveValue("mohair");
});
