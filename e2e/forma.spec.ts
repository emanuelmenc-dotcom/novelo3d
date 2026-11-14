// SPDX-License-Identifier: GPL-3.0-or-later
// Nova peça por forma (P5b): a janela gera a receita ao vivo, cria a peça e, pela linha do tempo, muda a forma depois.
import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { figureWithArms, toStl } from "../packages/engine-forward/test/shapes.ts";
import { expectTimelineOk, goTree, ribbon, sphereStl } from "./ribbon.ts";

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

test("peça achatada com saliência (P5c): menos pontos ao achatar, a saliência acrescenta, e a peça é criada", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => count(page)).toBe(433);
  await ribbon(page, "montagem");
  await page.getByTestId("shape-open").click();
  const round = await total(page);
  await page.getByTestId("shape-flat").fill("50");
  await expect.poll(() => total(page)).toBeLessThan(round);
  const flat = await total(page);
  await page.getByTestId("shape-bump").check();
  await page.getByTestId("shape-bump-amount").fill("60");
  await expect.poll(() => total(page)).toBeGreaterThan(flat);
  await page.screenshot({ path: "test-results/forma-achatada.png" });
  const made = await total(page);
  await page.getByTestId("shape-create").click();
  await expect.poll(() => count(page)).toBe(433 + made + 1);
  await expectTimelineOk(page);
});

test("peça de um STL (P5d, rota A): a esfera vira peça com receita, e a linha do tempo confere", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => count(page)).toBe(433);
  await ribbon(page, "montagem");
  await page.getByTestId("stl-open").setInputFiles({
    name: "bola.stl",
    mimeType: "model/stl",
    buffer: Buffer.from(sphereStl(30)),
  });
  await expect(page.getByText(/Peça criada de bola.stl\./)).toBeVisible();
  await expect.poll(() => count(page)).toBeGreaterThan(433 + 400);
  await expectTimelineOk(page);
});

test("STL de um boneco com dois braços: corpo e dois braços como peças, com onde costurar", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await expect.poll(() => count(page)).toBe(433);
  await ribbon(page, "montagem");
  await page.getByTestId("stl-open").setInputFiles({
    name: "boneco.stl",
    mimeType: "model/stl",
    buffer: Buffer.from(toStl(figureWithArms())),
  });
  await expect(
    page.getByText(/3 peças criadas de boneco\.stl\. Costure: .*boneco · Parte 2 na volta \d+ de boneco/),
  ).toBeVisible({
    timeout: 30_000,
  });
  await goTree(page);
  await expect(page.locator("[data-part]", { hasText: "boneco · Parte 3" })).toBeVisible();
  await page.screenshot({ path: "test-results/forma-boneco.png" });
  await expectTimelineOk(page);
});
