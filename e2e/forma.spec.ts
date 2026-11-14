// SPDX-License-Identifier: GPL-3.0-or-later
// Nova peça por forma (P5b): a janela gera a receita ao vivo, cria a peça e, pela linha do tempo, muda a forma depois.
import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { expectTimelineOk, ribbon } from "./ribbon.ts";

const count = (page: Page) => page.evaluate(() => window.__view3d?.state().count ?? 0);
const summary = (page: Page) => page.getByTestId("shape-summary");
const total = async (page: Page) =>
  Number(/(\d+) pontos/.exec((await summary(page).textContent()) ?? "")?.[1]);

test("peça composta de três trechos: prévia ao vivo, criar, e mudar a forma pela linha do tempo", async ({
  page,
}) => {
  mkdirSync("test-results", { recursive: true });
  await page.goto("/");
  await expect.poll(() => count(page)).toBe(433);
  await ribbon(page, "montagem");
  await page.getByTestId("shape-open").click();
  await expect(page.getByTestId("shape-window")).toBeVisible();
  await page.getByTestId("shape-kind").selectOption("stack");
  await expect(summary(page)).toContainText(/\d+ voltas · \d+ pontos/);
  const before = await total(page);
  // cilindro do meio mais alto: mais pontos, na hora
  await page.getByTestId("shape-seg-1-height").fill("30");
  await expect.poll(() => total(page)).toBeGreaterThan(before);
  await page.getByTestId("shape-name").fill("Corpo");
  await page.screenshot({ path: "test-results/forma-janela.png" });
  const created = await total(page);
  await page.getByTestId("shape-create").click();
  await expect(page.getByTestId("shape-window")).toHaveCount(0);
  await expect.poll(() => count(page)).toBe(433 + created + 1); // + o nó do anel mágico
  await page.screenshot({ path: "test-results/forma-peca-3d.png" });

  // a feature da linha do tempo abre a mesma janela com a forma; aplicar muda a peça
  await page.locator('[data-testid^="feature-"]').last().click();
  await page.getByRole("menuitem", { name: "Editar parâmetros" }).click();
  await page.getByRole("button", { name: "Editar a forma" }).click();
  await expect(page.getByTestId("shape-seg-1-height")).toHaveValue("30");
  await page.getByTestId("shape-seg-1-height").fill("10");
  await expect.poll(() => total(page)).toBeLessThan(created);
  const smaller = await total(page);
  await page.getByTestId("shape-create").click();
  await expect.poll(() => count(page)).toBe(433 + smaller + 1);
  await expectTimelineOk(page);
});

test("perfil livre: arrastar um ponto muda a forma e as contagens", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => count(page)).toBe(433);
  await ribbon(page, "montagem");
  await page.getByTestId("shape-open").click();
  await page.getByTestId("shape-kind").selectOption("profile");
  const before = await total(page);
  const h = await page.getByTestId("shape-point-2").boundingBox();
  if (!h) throw new Error("sem ponto");
  // leva o ponto mais largo para fora: a peça engorda
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 40, h.y + h.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => total(page)).toBeGreaterThan(before);
  await page.screenshot({ path: "test-results/forma-perfil.png" });
});
